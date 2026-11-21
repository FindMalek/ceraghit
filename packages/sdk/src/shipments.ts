import { z } from "zod"
import { currencySchema } from "./schemas"

export const shipmentStatusSchema = z.enum([
  "created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "returned",
  "on_hold",
  "cancelled",
])
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  created: "Étiquette créée",
  picked_up: "Colis pris en charge",
  in_transit: "En transit",
  out_for_delivery: "En cours de livraison",
  delivered: "Livrée",
  exception: "Incident de livraison",
  returned: "Retournée",
  on_hold: "En attente",
  cancelled: "Annulée",
}

export const shipmentEnvironmentSchema = z.enum(["test", "live", "fake"])

export const shipmentConsigneeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().max(120).optional(),
  line1: z.string().trim().min(3).max(100),
  city: z.string().trim().min(2).max(60),
  postalCode: z.string().trim().max(10).optional(),
  country: z.string().trim().toUpperCase().length(2),
})

export const shipmentParcelSchema = z.object({
  weightGrams: z.number().int().min(1).max(30_000),
  lengthCm: z.number().int().min(1).max(150),
  widthCm: z.number().int().min(1).max(150),
  heightCm: z.number().int().min(1).max(150),
  pieces: z.number().int().min(1).max(10),
})

export const shipmentDraftSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  currency: currencySchema,
  environment: shipmentEnvironmentSchema,
  consignee: shipmentConsigneeSchema,
  parcel: shipmentParcelSchema,
  description: z.string(),
  fragile: z.boolean(),
  /** What Aramex collects on delivery, in the order currency (TND only). Null when the order is not cash on delivery. */
  codAmountMinor: z.number().int().nullable(),
  /** The order subtotal, offered when the owner insures the parcel. Same currency as the order, never converted. */
  insuranceSuggestedMinor: z.number().int(),
  /** Why the owner cannot create it (international, already shipped...), null when it can be created. */
  blocked: z.string().nullable(),
  warnings: z.array(z.string()),
})
export type ShipmentDraft = z.infer<typeof shipmentDraftSchema>

export const shipmentDraftInputSchema = z.object({
  orderId: z.string(),
  consignee: shipmentConsigneeSchema,
  parcel: shipmentParcelSchema,
  description: z.string().trim().min(3).max(50),
  fragile: z.boolean(),
  insurance: z.object({ amountMinor: z.number().int().min(1).max(100_000_000) }).nullable(),
})
export type ShipmentDraftInput = z.infer<typeof shipmentDraftInputSchema>

export const adminShipmentSchema = z.object({
  id: z.string(),
  provider: z.string(),
  environment: shipmentEnvironmentSchema,
  waybill: z.string(),
  productGroup: z.string(),
  status: shipmentStatusSchema,
  codAmountMinor: z.number().int().nullable(),
  insuranceMinor: z.number().int().nullable(),
  currency: currencySchema,
  hasLabel: z.boolean(),
  errors: z.array(z.object({ at: z.string(), code: z.string(), message: z.string() })),
  createdAt: z.string(),
})
export type AdminShipment = z.infer<typeof adminShipmentSchema>
