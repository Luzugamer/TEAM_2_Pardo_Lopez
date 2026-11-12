import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiHeader, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { Claims } from '../../shared/auth/claims.decorator';
import { RequireScopes } from '../../shared/auth/scopes.decorator';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { ProblemDetailsException } from '../../shared/errors/problem-details.exception';
import { FormsService } from '../application/forms.service';
import { CloseBindingDto, CreateBindingDto, CreateFormDto, FormVersionDto, PublishFormDto } from './forms.dto';

@ApiTags('Forms - EC-C')
@ApiSecurity('DevActor')
@Controller()
@UseGuards(AuthGuard)
@RequireScopes('events:write')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class FormsController {
  constructor(private readonly service: FormsService, private readonly idempotency: IdempotencyService) {}
  private revision(tag?: string): number {
    if (!tag) throw ProblemDetailsException.preconditionRequired();
    const raw = tag.trim().replace(/^W\//,'').replace(/^"|"$/g,'');
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw ProblemDetailsException.badRequest('Invalid If-Match revision.');
    return Number(raw);
  }
  private async command(c: TenantClaims, key: string | undefined, req: Request, res: Response, operation: string, payload: unknown, work: () => Promise<any>, status = 201) {
    if (!key?.trim() || key.length > 128) throw ProblemDetailsException.badRequest('Idempotency-Key is required.');
    const result = await this.idempotency.executeOnce(c.organization_id,c.sub,operation,key,req.originalUrl || req.url,payload,async () => {
      const body = await work(); const headers: Record<string, string> = {}; if (body?.revision) headers.ETag = `"${body.revision}"`; return { statusCode: status, headers, body };
    });
    for (const [name,value] of Object.entries(result.headers)) res.setHeader(name,value);
    res.status(result.statusCode).json(result.body);
  }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('forms') create(@Claims() c: TenantClaims,@Body() dto: CreateFormDto,@Headers('idempotency-key') key: string,@Req() req: Request,@Res() res: Response) { return this.command(c,key,req,res,'forms.create',dto,() => this.service.createForm(c,dto)); }
  @Get('forms') list(@Claims() c: TenantClaims) { return this.service.listForms(c); }
  @Get('forms/:id') get(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string) { return this.service.getForm(c,id); }
  @Get('forms/:id/versions') versions(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string) { return this.service.listVersions(c,id); }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('forms/:id/versions') version(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string,@Body() dto: FormVersionDto,@Headers('idempotency-key') key: string,@Req() req: Request,@Res() res: Response) { return this.command(c,key,req,res,'forms.version.create',dto,() => this.service.createVersion(c,id,dto)); }
  @Get('form-versions/:id') getVersion(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string) { return this.service.getVersion(c,id); }
  @ApiHeader({ name: 'If-Match', required: true })
  @Patch('form-versions/:id') async update(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string,@Headers('if-match') tag: string,@Body() dto: FormVersionDto,@Res() res: Response) { const row = await this.service.updateVersion(c,id,this.revision(tag),dto); res.setHeader('ETag',`"${row.revision}"`).json(row); }
  @Post('form-versions/:id/validations') validate(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string) { return this.service.validate(c,id); }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @Post('form-versions/:id/publications') @RequireScopes('events:publish') publish(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string,@Headers('if-match') tag: string,@Headers('idempotency-key') key: string,@Body() dto: PublishFormDto,@Req() req: Request,@Res() res: Response) { const revision=this.revision(tag); return this.command(c,key,req,res,'forms.version.publish',{ ...dto, revision },() => this.service.publish(c,id,revision,dto.expected_hash)); }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('events/:id/form-bindings') bind(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string,@Headers('idempotency-key') key: string,@Body() dto: CreateBindingDto,@Req() req: Request,@Res() res: Response) { return this.command(c,key,req,res,'forms.binding.create',dto,() => this.service.createBinding(c,id,dto)); }
  @Get('events/:id/form-bindings') bindings(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string) { return this.service.listBindings(c,id); }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @Post('bindings/:id/openings') open(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string,@Headers('if-match') tag: string,@Headers('idempotency-key') key: string,@Req() req: Request,@Res() res: Response) { const revision=this.revision(tag); return this.command(c,key,req,res,'forms.binding.open',{ revision },() => this.service.transition(c,id,revision,'open'),200); }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @Post('bindings/:id/cancellations') cancel(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string,@Headers('if-match') tag: string,@Headers('idempotency-key') key: string,@Body() dto: CloseBindingDto,@Req() req: Request,@Res() res: Response) { const revision=this.revision(tag); return this.command(c,key,req,res,'forms.binding.cancel',{ ...dto,revision },() => this.service.transition(c,id,revision,'cancelled',dto.reason),200); }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  @Post('bindings/:id/closures') close(@Claims() c: TenantClaims,@Param('id',ParseUUIDPipe) id: string,@Headers('if-match') tag: string,@Headers('idempotency-key') key: string,@Body() dto: CloseBindingDto,@Req() req: Request,@Res() res: Response) { const revision=this.revision(tag); return this.command(c,key,req,res,'forms.binding.close',{ ...dto,revision },() => this.service.close(c,id,revision,dto.reason),200); }
}
