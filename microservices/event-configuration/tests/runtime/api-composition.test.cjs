const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const apiRoot = path.resolve(__dirname, '../../apps/configuration-api');
const apiRequire = createRequire(path.join(apiRoot, 'package.json'));
apiRequire('reflect-metadata');
const { Test } = apiRequire('@nestjs/testing');
const { DocumentBuilder, SwaggerModule } = apiRequire('@nestjs/swagger');
const { AppModule } = require(path.join(apiRoot, 'dist/app.module.js'));
const { DatabaseService } = require(path.join(apiRoot, 'dist/shared/database/database.service.js'));
const { resolveCorsOrigin, isSwaggerEnabled, configureApp } = require(path.join(apiRoot, 'dist/main.js'));
const { DomainException } = require(path.join(apiRoot, 'dist/shared/errors/domain.exception.js'));
const { ProblemDetailsFilter } = require(path.join(apiRoot, 'dist/shared/errors/problem-details.filter.js'));

process.env.AUTH_MODE = 'mock';
process.env.NODE_ENV = 'test';

test('compiled API wires its modules and retains the main HTTP routes', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({ getIsConnected: () => false })
    .compile();
  const app = moduleRef.createNestApplication();
  try {
    app.setGlobalPrefix('configuration/v1');
    await app.init();
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Test').setVersion('1').build());
    assert.ok(document.paths['/configuration/v1/health']?.get);
    assert.ok(document.paths['/configuration/v1/events']?.post);
    assert.ok(document.paths['/configuration/v1/forms']?.post);
    assert.ok(document.paths['/configuration/v1/form-versions/{id}/publications']?.post);
    assert.ok(document.paths['/configuration/v1/venues']?.post);
    assert.ok(document.paths['/configuration/v1/events/{eventId}/sessions/{sessionId}/schedules']?.post);
    assert.ok(document.paths['/configuration/v1/events/{id}/releases']?.post);
  } finally {
    await app.close();
  }
});
const { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } = apiRequire('@nestjs/common/constants');
const { RequestMethod, HttpException } = apiRequire('@nestjs/common');
const { CLAIMS_PROVIDER, AuthGuard } = require(path.join(apiRoot, 'dist/shared/auth/auth.guard.js'));
const { EventsService } = require(path.join(apiRoot, 'dist/events/application/events.service.js'));
const { EventsController } = require(path.join(apiRoot, 'dist/events/presentation/events.controller.js'));
const { PublishingController } = require(path.join(apiRoot, 'dist/publishing/presentation/publishing.controller.js'));
const { ScheduleController } = require(path.join(apiRoot, 'dist/schedule/presentation/schedule.controller.js'));
const { SpeakersController } = require(path.join(apiRoot, 'dist/schedule/presentation/speakers.controller.js'));
const { FormsController } = require(path.join(apiRoot, 'dist/forms/presentation/forms.controller.js'));

test('all business HTTP handlers have an auth guard and explicit scope policy', () => {
  for (const controller of [EventsController, PublishingController, ScheduleController, SpeakersController, FormsController]) {
    assert.ok((Reflect.getMetadata(GUARDS_METADATA, controller) || []).includes(AuthGuard), controller.name);
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const method = controller.prototype[name];
      if (typeof method !== 'function' || Reflect.getMetadata(METHOD_METADATA, method) === undefined) continue;
      const scopes = Reflect.getMetadata('required_scopes', method) || Reflect.getMetadata('required_scopes', controller);
      assert.ok(Array.isArray(scopes) && scopes.length > 0, `${controller.name}.${name}`);
    }
  }
});

test('HTTP accepts an injected provider, denies missing permission and propagates its outage without mock fallback', async () => {
  const org = '0194eb00-0000-7000-8000-000000000001';
  const provider = { async resolve(request) {
    if (request.headers['x-test-provider'] === 'down') throw new HttpException('unavailable', 503);
    return { sub: '0194eb00-0000-7000-9000-000000000001', organization_id: org, roles: [], scopes: request.headers['x-test-provider'] === 'reader' ? ['events:read'] : ['events:write'] };
  } };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService).useValue({ getIsConnected: () => false })
    .overrideProvider(CLAIMS_PROVIDER).useValue(provider)
    .overrideProvider(EventsService).useValue({ async getEventById(claims, id) { return { id, organization_id: claims.organization_id, revision_number: 1 }; } })
    .compile();
  const app = moduleRef.createNestApplication();
  try {
    app.setGlobalPrefix('configuration/v1');
    await app.listen(0, '127.0.0.1');
    const url = `${await app.getUrl()}/configuration/v1/events/0194eb11-1000-7000-8000-000000000001`;
    const ok = await fetch(url, { headers: { 'x-test-provider': 'reader', 'x-organization-id': '0194eb00-0000-7000-8000-000000000002' } });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).organization_id, org);
    const forbidden = await fetch(url, { method: 'PATCH', headers: { 'x-test-provider': 'reader', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(forbidden.status, 403);
    const unavailable = await fetch(url, { headers: { 'x-test-provider': 'down', 'x-dev-actor': 'org-a-manager' } });
    assert.equal(unavailable.status, 503);
  } finally { await app.close(); }
});

test('CORS and Swagger policies enforce fail-closed defaults outside development and test', () => {
  const warnings = [];
  const logger = { warn: (msg) => warnings.push(msg) };

  assert.equal(resolveCorsOrigin({ NODE_ENV: 'development' }, logger), true);
  assert.equal(resolveCorsOrigin({ NODE_ENV: 'test' }, logger), true);
  assert.equal(resolveCorsOrigin({ NODE_ENV: 'production' }, logger), false);
  assert.equal(resolveCorsOrigin({ NODE_ENV: 'staging' }, logger), false);
  assert.equal(resolveCorsOrigin({}, logger), false);
  assert.equal(warnings.length, 3);

  assert.deepEqual(
    resolveCorsOrigin({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: ' https://app.nexo.pe/ , https://admin.nexo.pe:8443 , , ',
    }, logger),
    ['https://app.nexo.pe', 'https://admin.nexo.pe:8443'],
  );

  assert.equal(isSwaggerEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(isSwaggerEnabled({ NODE_ENV: 'test' }), true);
  assert.equal(isSwaggerEnabled({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }), false);
  assert.equal(isSwaggerEnabled({ NODE_ENV: 'staging' }), false);
  assert.equal(isSwaggerEnabled({ NODE_ENV: 'staging', SWAGGER_ENABLED: 'true' }), true);
  assert.equal(isSwaggerEnabled({}), false);
  assert.equal(isSwaggerEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }), false);
});

test('configureApp disables Swagger in production and rejects non-whitelisted DTO properties', async () => {
  const org = '0194eb00-0000-7000-8000-000000000001';
  const provider = {
    async resolve() {
      return {
        sub: '0194eb00-0000-7000-9000-000000000001',
        organization_id: org,
        roles: ['organizer'],
        scopes: ['events:write', 'events:publish'],
      };
    },
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService).useValue({ getIsConnected: () => false })
    .overrideProvider(CLAIMS_PROVIDER).useValue(provider)
    .compile();
  const app = moduleRef.createNestApplication();
  try {
    configureApp(app, { NODE_ENV: 'production' }, { warn() {} });
    await app.listen(0, '127.0.0.1');
    const baseUrl = await app.getUrl();

    const docsRes = await fetch(`${baseUrl}/configuration/v1/docs`);
    assert.equal(docsRes.status, 404);
    const docsJsonRes = await fetch(`${baseUrl}/configuration/v1/docs-json`);
    assert.equal(docsJsonRes.status, 404);

    const badPayloadRes = await fetch(`${baseUrl}/configuration/v1/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idemp-non-whitelisted-check-0001',
      },
      body: JSON.stringify({
        site_id: '0194eb10-0000-7000-8000-000000000001',
        slug: 'strict-pipe-event',
        kind: 'conference',
        title: 'Strict Pipe Event',
        timezone: 'UTC',
        starts_at: '2026-12-01T10:00:00Z',
        ends_at: '2026-12-02T10:00:00Z',
        unexpected_field: 'should_be_rejected',
      }),
    });
    assert.equal(badPayloadRes.status, 400);
  } finally {
    await app.close();
  }
});

test('application and domain layers do not import from presentation or ProblemDetailsException', () => {
  const srcRoot = path.join(apiRoot, 'src');
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
  };

  const targetFiles = walk(srcRoot).filter((filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    return (
      normalized.endsWith('.ts') &&
      !normalized.endsWith('.spec.ts') &&
      (normalized.includes('/application/') || normalized.includes('/domain/'))
    );
  });

  assert.ok(targetFiles.length > 0, 'Expected application/domain TypeScript files to inspect');

  for (const filePath of targetFiles) {
    const relPath = path.relative(srcRoot, filePath).replace(/\\/g, '/');
    const source = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      /from\s+['"][^'"]*presentation\//.test(source),
      false,
      `${relPath} must not import from presentation/`,
    );
    assert.equal(
      source.includes('ProblemDetailsException'),
      false,
      `${relPath} must not reference ProblemDetailsException`,
    );
  }
});

test('ProblemDetailsFilter maps DomainException to RFC 9457 application/problem+json response', () => {
  const filter = new ProblemDetailsFilter();
  let statusCode = 0;
  let contentType = '';
  let jsonBody = null;

  const mockResponse = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      if (name.toLowerCase() === 'content-type') {
        contentType = value;
      }
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
  };

  const mockRequest = {
    originalUrl: '/configuration/v1/events',
    url: '/configuration/v1/events',
    headers: { 'x-request-id': 'req-domain-err-001' },
  };

  const mockHost = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  };

  const exception = DomainException.conflict(
    'An event with this slug already exists in the site.',
    'slug_already_exists',
  );

  filter.catch(exception, mockHost);

  assert.equal(statusCode, 409);
  assert.equal(contentType, 'application/problem+json');
  assert.deepEqual(jsonBody, {
    type: 'urn:problem:conflict',
    title: 'Conflict',
    status: 409,
    detail: 'An event with this slug already exists in the site.',
    instance: '/configuration/v1/events',
    code: 'slug_already_exists',
    errors: [],
    request_id: 'req-domain-err-001',
  });
});
