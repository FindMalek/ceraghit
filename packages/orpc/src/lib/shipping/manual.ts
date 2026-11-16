import { ShippingError } from "./errors"
import type { ShippingProvider } from "./types"

export class ManualShippingProvider implements ShippingProvider {
  readonly id = "manual" as const

  async quote() {
    return null
  }
  async createShipment(): Promise<never> {
    throw new ShippingError("unsupported")
  }
  async getLabel(): Promise<never> {
    throw new ShippingError("unsupported")
  }
  async track() {
    return []
  }
  async cancel(): Promise<never> {
    throw new ShippingError("unsupported")
  }
  async validatePickup(): Promise<never> {
    throw new ShippingError("unsupported")
  }
  async createPickup(): Promise<never> {
    throw new ShippingError("unsupported")
  }
  async cancelPickup(): Promise<never> {
    throw new ShippingError("unsupported")
  }
  async testConnection() {
    return { ok: true as const }
  }
}
