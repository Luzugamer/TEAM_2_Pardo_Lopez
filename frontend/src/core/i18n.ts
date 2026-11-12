import { useEffect, useState } from "react";

export type Locale = "es" | "en";
const storageKey = "nexo.locale";
const messages = {
  es: {
    "nav.workspace": "Espacio de trabajo",
    "nav.organization": "ORGANIZACIÓN ACTIVA",
    "nav.home": "Inicio",
    "nav.homeDescription": "Contexto de tu organización",
    "nav.onsite": "Operaciones presenciales",
    "nav.onsiteDescription": "Control de acceso y asistencia",
    "nav.main": "Navegación principal",
    "nav.modules": "Módulos de Nexo",
    "nav.collapse": "Ocultar menú lateral",
    "nav.expand": "Mostrar menú lateral",
    "nav.logout": "Cerrar sesión",
    "nav.theme": "Cambiar tema",
    "nav.language": "Idioma",
    "nav.spanish": "Español",
    "nav.english": "Inglés",
    "top.tenant": "TENANT ACTIVO",
    "top.workspace": "Espacio de trabajo principal",
    "top.connected": "API principal conectada",
    "home.eyebrow": "PLATAFORMA NEXO",
    "home.title": "Todo tu trabajo, conectado.",
    "home.description":
      "Selecciona un módulo para comenzar a operar la organización.",
    "common.back": "Volver al inicio",
    "common.forbidden": "Sin permisos",
    "common.forbiddenDescription": "No tienes acceso a este módulo.",
    "common.notFound": "Ruta no encontrada",
    "common.notFoundDescription":
      "Nexo no encontró un módulo para esta dirección.",
    "common.loading": "Cargando módulo…",
    "onsite.eyebrow": "MÓDULO INTEGRADO · EQUIPO 4",
    "onsite.title": "Operaciones presenciales",
    "onsite.description":
      "Administra el acceso presencial y consulta los resultados de tu evento.",
    "onsite.event": "Evento activo",
    "onsite.demo": "Demo Day IncubaUNAS",
    "onsite.congress": "Congreso FIIS",
    "onsite.checkinTab": "Control de acceso",
    "onsite.attendanceTab": "Asistencia",
    "onsite.reportsTab": "Reportes y HukID",
    "onsite.station": "PUESTO 01 · EN LÍNEA",
    "onsite.register": "Registrar asistencia",
    "onsite.registerDescription": "Usa el lector QR o busca un ticket.",
    "onsite.scanner": "Simulador de escáner",
    "onsite.scannerDescription": "Preparado para cámara QR",
    "onsite.ready": "Listo",
    "onsite.openCamera": "Abrir cámara",
    "onsite.cameraTitle": "Escanear código QR",
    "onsite.cameraDescription": "Permite el uso de la cámara y centra el código QR dentro del marco.",
    "onsite.cameraStarting": "Solicitando acceso a la cámara…",
    "onsite.cameraReady": "Cámara lista. Enfoca el código QR.",
    "onsite.cameraError": "No se pudo acceder a la cámara. Revisa los permisos del navegador o usa la búsqueda manual.",
    "onsite.stopCamera": "Cerrar cámara",
    "onsite.scan": "Simular escaneo",
    "onsite.search": "Buscar ticket",
    "onsite.ticketCode": "Código QR o ticket",
    "onsite.ticketCodeHelp": "Ingresa un código para buscar o simular un escaneo.",
    "onsite.searching": "Buscando…",
    "onsite.searchEmpty": "No encontramos un ticket con ese código.",
    "onsite.searchSelect": "Ticket encontrado",
    "onsite.registerSelected": "Registrar entrada",
    "onsite.ticketReady": "Ticket apto para ingreso",
    "onsite.ticketRejected": "Ticket no apto para ingreso",
    "onsite.qrInvalid": "El código QR no contiene un ticket válido.",
    "onsite.dashboardError": "No se pudieron cargar las métricas del evento.",
    "onsite.searchResult": "Búsqueda exacta disponible: ticket-001",
    "onsite.readiness": "ESTADO OPERATIVO",
    "onsite.healthy": "Operación saludable",
    "onsite.release": "Versión",
    "onsite.revocations": "Revocaciones",
    "onsite.latency": "Latencia",
    "onsite.scope": "Alcance",
    "onsite.registered": "Inscritos",
    "onsite.confirmed": "Confirmados",
    "onsite.present": "Presentes",
    "onsite.attendance": "Asistencia",
    "onsite.updated": "Actualizado ahora",
    "onsite.target": "Objetivo 70%",
    "onsite.attendanceTitle": "Asistencia del evento",
    "onsite.attendanceSummary": "{percentage} de asistencia",
    "onsite.attendanceDescription":
      "Los registros no se editan; las correcciones se registran como compensaciones.",
    "onsite.entries": "entradas registradas",
    "onsite.history":
      "El historial aparecerá aquí después de registrar el primer acceso.",
    "onsite.registerEntry": "Registrar entrada",
    "onsite.reportsTitle": "Reportes, certificados y HukID",
    "onsite.reportsDescription":
      "Acciones simuladas para validar el flujo antes de conectar proveedores.",
    "onsite.report": "Generar reporte",
    "onsite.certificate": "Emitir certificados",
    "onsite.hukid": "Enviar a HukID",
    "onsite.apiError": "API desconectada: revisa el backend del Equipo 4",
    "onsite.checkinSuccess": "Entrada registrada para Participante demo",
    "onsite.checkinError": "No se pudo registrar: {error}",
  },
  en: {
    "nav.workspace": "Workspace",
    "nav.organization": "ACTIVE ORGANIZATION",
    "nav.home": "Home",
    "nav.homeDescription": "Organization context",
    "nav.onsite": "On-site operations",
    "nav.onsiteDescription": "Access control and attendance",
    "nav.main": "Main navigation",
    "nav.modules": "Nexo modules",
    "nav.collapse": "Collapse sidebar",
    "nav.expand": "Expand sidebar",
    "nav.logout": "Sign out",
    "nav.theme": "Change theme",
    "nav.language": "Language",
    "nav.spanish": "Spanish",
    "nav.english": "English",
    "top.tenant": "ACTIVE TENANT",
    "top.workspace": "Main workspace",
    "top.connected": "Core API connected",
    "home.eyebrow": "NEXO PLATFORM",
    "home.title": "All your work, connected.",
    "home.description": "Select a module to start operating the organization.",
    "common.back": "Back to home",
    "common.forbidden": "Access denied",
    "common.forbiddenDescription": "You do not have access to this module.",
    "common.notFound": "Route not found",
    "common.notFoundDescription":
      "Nexo could not find a module for this address.",
    "common.loading": "Loading module…",
    "onsite.eyebrow": "INTEGRATED MODULE · TEAM 4",
    "onsite.title": "On-site operations",
    "onsite.description":
      "Manage on-site access and review your event results.",
    "onsite.event": "Active event",
    "onsite.demo": "IncubaUNAS Demo Day",
    "onsite.congress": "FIIS Congress",
    "onsite.checkinTab": "Access control",
    "onsite.attendanceTab": "Attendance",
    "onsite.reportsTab": "Reports and HukID",
    "onsite.station": "STATION 01 · ONLINE",
    "onsite.register": "Register attendance",
    "onsite.registerDescription": "Use the QR scanner or search for a ticket.",
    "onsite.scanner": "Scanner simulator",
    "onsite.scannerDescription": "Ready for QR camera",
    "onsite.ready": "Ready",
    "onsite.openCamera": "Open camera",
    "onsite.cameraTitle": "Scan QR code",
    "onsite.cameraDescription": "Allow camera access and centre the QR code inside the frame.",
    "onsite.cameraStarting": "Requesting camera access…",
    "onsite.cameraReady": "Camera ready. Point it at the QR code.",
    "onsite.cameraError": "The camera could not be accessed. Check browser permissions or use manual search.",
    "onsite.stopCamera": "Close camera",
    "onsite.scan": "Simulate scan",
    "onsite.search": "Search ticket",
    "onsite.ticketCode": "QR or ticket code",
    "onsite.ticketCodeHelp": "Enter a code to search or simulate a scan.",
    "onsite.searching": "Searching…",
    "onsite.searchEmpty": "No ticket was found for that code.",
    "onsite.searchSelect": "Ticket found",
    "onsite.registerSelected": "Register entry",
    "onsite.ticketReady": "Ticket is ready for entry",
    "onsite.ticketRejected": "Ticket is not eligible for entry",
    "onsite.qrInvalid": "The QR code does not contain a valid ticket.",
    "onsite.dashboardError": "Event metrics could not be loaded.",
    "onsite.searchResult": "Exact search available: ticket-001",
    "onsite.readiness": "OPERATION STATUS",
    "onsite.healthy": "Operation healthy",
    "onsite.release": "Release",
    "onsite.revocations": "Revocations",
    "onsite.latency": "Latency",
    "onsite.scope": "Scope",
    "onsite.registered": "Registered",
    "onsite.confirmed": "Confirmed",
    "onsite.present": "Present",
    "onsite.attendance": "Attendance",
    "onsite.updated": "Updated now",
    "onsite.target": "70% target",
    "onsite.attendanceTitle": "Event attendance",
    "onsite.attendanceSummary": "{percentage} attendance",
    "onsite.attendanceDescription":
      "Records are not edited; corrections are recorded as compensations.",
    "onsite.entries": "entries recorded",
    "onsite.history":
      "History will appear here after the first access is recorded.",
    "onsite.registerEntry": "Register entry",
    "onsite.reportsTitle": "Reports, certificates and HukID",
    "onsite.reportsDescription":
      "Simulated actions to validate the flow before connecting providers.",
    "onsite.report": "Generate report",
    "onsite.certificate": "Issue certificates",
    "onsite.hukid": "Send to HukID",
    "onsite.apiError": "API disconnected: check Team 4 backend",
    "onsite.checkinSuccess": "Entry registered for Demo participant",
    "onsite.checkinError": "Could not register: {error}",
  },
} as const;
export function readLocale(): Locale {
  const value = localStorage.getItem(storageKey);
  return value === "en" ? "en" : "es";
}
export function saveLocale(locale: Locale) {
  localStorage.setItem(storageKey, locale);
}
export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(() => readLocale());
  useEffect(() => {
    const onLocaleChange = (event: Event) =>
      setLocaleState((event as CustomEvent<Locale>).detail);
    window.addEventListener("nexo:locale", onLocaleChange);
    return () => window.removeEventListener("nexo:locale", onLocaleChange);
  }, []);
  useEffect(() => saveLocale(locale), [locale]);
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    window.dispatchEvent(
      new CustomEvent<Locale>("nexo:locale", { detail: next }),
    );
  };
  const t = (key: keyof typeof messages.es, vars?: Record<string, string>) => {
    let value: string = messages[locale][key] || messages.es[key] || key;
    Object.entries(vars || {}).forEach(([name, replacement]) => {
      value = value.replace(`{${name}}`, replacement);
    });
    return value;
  };
  return { locale, setLocale, t };
}
