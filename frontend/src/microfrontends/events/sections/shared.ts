import {
  Activity,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  Layers3,
  MapPin,
  Users,
} from "lucide-react";
import type { EventsRequest, RecordData } from "../api";
import type { Dialog, Field } from "../components";

export type Section =
  | "overview"
  | "events"
  | "agenda"
  | "venues"
  | "speakers"
  | "forms"
  | "publication"
  | "activity";

export const NAV_ITEMS: {
  id: Section;
  label: string;
  icon: typeof Activity;
}[] = [
  { id: "overview", label: "Resumen", icon: Layers3 },
  { id: "events", label: "Eventos", icon: CalendarDays },
  { id: "agenda", label: "Agenda y programas", icon: ClipboardList },
  { id: "venues", label: "Sedes y salas", icon: MapPin },
  { id: "speakers", label: "Ponentes", icon: Users },
  { id: "forms", label: "Formularios", icon: ClipboardList },
  { id: "publication", label: "Publicación", icon: FileCheck2 },
  { id: "activity", label: "Actividad", icon: Activity },
];

export const textField = (
  name: string,
  label: string,
  required = false,
): Field => ({
  name,
  label,
  required,
});

export const dateField = (
  name: string,
  label: string,
  required = true,
): Field => ({
  name,
  label,
  type: "datetime-local",
  required,
});

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const cleanPayload = (body: RecordData) =>
  Object.fromEntries(
    Object.entries(body).filter(
      ([, value]) => value !== "" && value !== undefined,
    ),
  );

export const selectOption = (row: RecordData, label = "") => ({
  value: row.id ?? "",
  label,
});

export type CommandFn = (
  title: string,
  path: string,
  fields: Field[],
  initial?: RecordData,
  revision?: number,
  method?: string,
) => void;

export type RunFn = (
  path: string,
  method?: string,
  body?: unknown,
  revision?: number,
  success?: string,
) => Promise<RecordData | undefined>;

export type InspectFn = (title: string, path: string) => Promise<void>;

export type OpenDialogFn = (dialog: Dialog | null) => void;

export type ShowErrorFn = (error: unknown) => void;

export type SectionContextProps = {
  request: EventsRequest;
  isReader: boolean;
  canPublish: boolean;
  run: RunFn;
  inspect: InspectFn;
  command: CommandFn;
  setDialog: OpenDialogFn;
  showError: ShowErrorFn;
};
