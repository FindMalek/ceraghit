import { z } from "zod"

/** Aramex sends `null` for empty arrays and objects; responses keep unknown fields so new ones never break parsing. */
const list = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((v) => v ?? [])
const text = z.string().nullish()

export const clientInfoSchema = z.object({
  UserName: z.string(),
  Password: z.string(),
  Version: z.string().optional(),
  AccountNumber: z.string(),
  AccountPin: z.string(),
  AccountEntity: z.string(),
  AccountCountryCode: z.string(),
  Source: z.number().int().optional(),
  PreferredLanguageCode: z.string().optional(),
})
export type ClientInfo = z.infer<typeof clientInfoSchema>

export const notificationSchema = z.object({ Code: text, Message: text }).passthrough()

const base = {
  Transaction: z.unknown().optional(),
  Notifications: list(notificationSchema),
  HasErrors: z.boolean().default(false),
}

export const moneySchema = z.object({ CurrencyCode: z.string(), Value: z.number() })
export const addressSchema = z.object({
  Line1: z.string().optional(),
  Line2: z.string().optional(),
  Line3: z.string().optional(),
  City: z.string().optional(),
  StateOrProvinceCode: z.string().optional(),
  PostCode: z.string().optional(),
  CountryCode: z.string().optional(),
})
export const contactSchema = z.object({
  Department: z.string().optional(),
  PersonName: z.string(),
  Title: z.string().optional(),
  CompanyName: z.string().optional(),
  PhoneNumber1: z.string(),
  PhoneNumber1Ext: z.string().optional(),
  PhoneNumber2: z.string(),
  CellPhone: z.string().optional(),
  EmailAddress: z.string().optional(),
  Type: z.string(),
})
export const partySchema = z.object({
  Reference1: z.string().optional(),
  AccountNumber: z.string().optional(),
  PartyAddress: addressSchema,
  Contact: contactSchema,
})
const weightSchema = z.object({ Unit: z.string(), Value: z.number() })
export const shipmentItemSchema = z.object({
  PackageType: z.string(),
  Quantity: z.number(),
  Weight: weightSchema,
  Comments: z.string().optional(),
  CommodityCode: z.string().optional(),
  GoodsDescription: z.string().optional(),
  CountryOfOrigin: z.string().optional(),
  CustomsValue: moneySchema.optional(),
  ProviderHSCode: z.string().optional(),
})
export const shipmentDetailsSchema = z.object({
  Dimensions: z.object({ Length: z.number(), Width: z.number(), Height: z.number(), Unit: z.string() }),
  ActualWeight: weightSchema,
  ChargeableWeight: weightSchema,
  DescriptionOfGoods: z.string(),
  GoodsOriginCountry: z.string(),
  NumberOfPieces: z.number().int(),
  ProductGroup: z.enum(["DOM", "EXP"]),
  ProductType: z.string(),
  PaymentType: z.string(),
  PaymentOptions: z.string(),
  CustomsValueAmount: moneySchema.optional(),
  CashOnDeliveryAmount: moneySchema.optional(),
  InsuranceAmount: moneySchema.optional(),
  Services: z.string().optional(),
  Items: z.array(shipmentItemSchema).optional(),
})
export const shipmentSchema = z.object({
  Reference1: z.string().optional(),
  Shipper: partySchema,
  Consignee: partySchema,
  ShippingDateTime: z.string(),
  Comments: z.string().optional(),
  OperationsInstructions: z.string().optional(),
  Details: shipmentDetailsSchema,
})

export const shipmentCreationRequestSchema = z.object({
  Shipments: z.array(shipmentSchema),
  LabelInfo: z.object({ ReportID: z.number().int(), ReportType: z.string() }).optional(),
  CommercialInvoiceReportID: z.number().int().optional(),
})

const labelSchema = z
  .object({
    LabelURL: text,
    // base64 string or a number array (WCF byte[]), unverified
    LabelFileContents: z.union([z.string(), z.array(z.number())]).nullish(),
  })
  .passthrough()
const attachmentSchema = z.object({ Name: text, Type: text, Url: text }).passthrough()

export const processedShipmentSchema = z
  .object({
    ID: text,
    Reference1: text,
    HasErrors: z.boolean().default(false),
    Notifications: list(notificationSchema),
    ShipmentLabel: labelSchema.nullish(),
    ShipmentAttachments: list(attachmentSchema),
  })
  .passthrough()
export const shipmentCreationResponseSchema = z
  .object({ ...base, Shipments: list(processedShipmentSchema) })
  .passthrough()

export const labelPrintingRequestSchema = z.object({
  ShipmentNumber: z.string(),
  ProductGroup: z.enum(["DOM", "EXP"]),
  OriginEntity: z.string(),
  LabelInfo: z.object({ ReportID: z.number().int(), ReportType: z.string() }),
})
export const labelPrintingResponseSchema = z
  .object({ ...base, ShipmentNumber: text, ShipmentLabel: labelSchema.nullish() })
  .passthrough()

export const commercialInvoicePrintingRequestSchema = z.object({
  ShipmentNumber: z.string(),
  ProductGroup: z.enum(["DOM", "EXP"]),
  OriginEntity: z.string(),
  ReportID: z.number().int(),
})
export const commercialInvoicePrintingResponseSchema = z
  .object({ ...base, CommercialInvoiceInfo: attachmentSchema.nullish() })
  .passthrough()

export const pickupCreationRequestSchema = z.object({
  Pickup: z.object({
    PickupAddress: addressSchema,
    PickupContact: contactSchema,
    PickupLocation: z.string(),
    PickupDate: z.string(),
    ReadyTime: z.string(),
    LastPickupTime: z.string(),
    ClosingTime: z.string(),
    Comments: z.string(),
    Reference1: z.string().optional(),
    Vehicle: z.string(),
    PickupItems: z.array(
      z.object({
        ProductGroup: z.enum(["DOM", "EXP"]),
        ProductType: z.string(),
        NumberOfShipments: z.number().int(),
        PackageType: z.string(),
        Payment: z.string(),
        ShipmentWeight: weightSchema,
        NumberOfPieces: z.number().int(),
      }),
    ),
    ExistingShipments: z
      .array(z.object({ Number: z.string(), OriginEntity: z.string(), ProductGroup: z.enum(["DOM", "EXP"]) }))
      .optional(),
  }),
})
export const pickupCreationResponseSchema = z
  .object({
    ...base,
    ProcessedPickup: z.object({ ID: text, GUID: text }).passthrough().nullish(),
  })
  .passthrough()

export const pickupCancelationRequestSchema = z.object({ PickupGUID: z.string(), Comments: z.string() })
export const pickupCancelationResponseSchema = z.object({ ...base, Message: text }).passthrough()

export const holdCreationRequestSchema = z.object({
  ShipmentHolds: z.array(z.object({ ShipmentNumber: z.string(), Comment: z.string() })),
})
export const holdCreationResponseSchema = z
  .object({
    ...base,
    ProcessedShipmentHolds: list(
      z
        .object({ ID: text, HasErrors: z.boolean().default(false), Notifications: list(notificationSchema) })
        .passthrough(),
    ),
  })
  .passthrough()

export const rateCalculatorRequestSchema = z.object({
  OriginAddress: addressSchema,
  DestinationAddress: addressSchema,
  ShipmentDetails: shipmentDetailsSchema,
  PreferredCurrencyCode: z.string().optional(),
})
export const rateCalculatorResponseSchema = z
  .object({ ...base, TotalAmount: moneySchema.nullish(), RateDetails: z.unknown().optional() })
  .passthrough()

export const shipmentTrackingRequestSchema = z.object({
  Shipments: z.array(z.string()),
  GetLastTrackingUpdateOnly: z.boolean().optional(),
})
export const trackingResultSchema = z
  .object({
    WaybillNumber: text,
    UpdateCode: text,
    UpdateDescription: text,
    UpdateDateTime: text,
    UpdateLocation: text,
    Comments: text,
    ProblemCode: text,
  })
  .passthrough()
export const shipmentTrackingResponseSchema = z
  .object({
    ...base,
    TrackingResults: list(z.object({ Key: z.string(), Value: list(trackingResultSchema) }).passthrough()),
    NonExistingWaybills: list(z.string()),
  })
  .passthrough()

export const shipmentDeliveredRequestSchema = z.object({ Shipment: z.string() })
export const shipmentDeliveredResponseSchema = z.object({ ...base, IsDelivered: z.boolean().nullish() }).passthrough()

export const countriesFetchingRequestSchema = z.object({})
export const countriesFetchingResponseSchema = z
  .object({
    ...base,
    Countries: list(
      z.object({ Code: z.string(), Name: text, IsoCode: text, StateRequired: z.boolean().nullish() }).passthrough(),
    ),
  })
  .passthrough()

export const citiesFetchingRequestSchema = z.object({
  CountryCode: z.string().optional(),
  State: z.string().optional(),
  NameStartsWith: z.string().optional(),
})
export const citiesFetchingResponseSchema = z.object({ ...base, Cities: list(z.string()) }).passthrough()

export const addressValidationRequestSchema = z.object({ Address: addressSchema })
export const addressValidationResponseSchema = z
  .object({ ...base, SuggestedAddresses: list(z.object({}).passthrough()) })
  .passthrough()

export const addressServiceabilityRequestSchema = z.object({
  Address: addressSchema,
  ServiceDetails: z.object({ ProductGroup: z.enum(["DOM", "EXP"]), ProductType: z.string(), ServiceMode: z.string() }),
})
export const addressServiceabilityResponseSchema = z
  .object({ ...base, IsServiced: z.boolean().nullish() })
  .passthrough()

export const pickupValidationRequestSchema = z.object({
  PickupDate: z.string(),
  ReadyTime: z.string(),
  LastPickupTime: z.string(),
  ClosingTime: z.string(),
  Vehicle: z.string().optional(),
})
export const pickupValidationResponseSchema = z.object({ ...base }).passthrough()
