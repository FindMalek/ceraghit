"use client"

import { Document, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer"
import { formatMoney, type InvoiceView } from "@workspace/sdk"

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  title: { fontSize: 20, marginBottom: 4 },
  muted: { color: "#666666" },
  block: { marginBottom: 12 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e5e5", paddingVertical: 4 },
  head: { borderBottomColor: "#1a1a1a", borderBottomWidth: 1 },
  cell: { flex: 1 },
  cellRight: { width: 80, textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  totalLabel: { width: 120, textAlign: "right", marginRight: 12 },
  totalValue: { width: 90, textAlign: "right" },
  footer: { marginTop: 28, color: "#666666", fontSize: 8 },
})

function money(minor: number, currency: InvoiceView["currency"]): string {
  return formatMoney(minor, currency, "fr")
}

function InvoiceDocument({ view }: { view: InvoiceView }) {
  const seller = view.seller
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{seller.displayName ?? seller.legalName ?? "Ceraghit"}</Text>
            {seller.address ? <Text style={styles.muted}>{seller.address}</Text> : null}
            {seller.city ? <Text style={styles.muted}>{seller.city}</Text> : null}
            {seller.email ? <Text style={styles.muted}>{seller.email}</Text> : null}
            {seller.taxId ? <Text style={styles.muted}>MF {seller.taxId}</Text> : null}
          </View>
          <View>
            <Text style={styles.title}>Facture</Text>
            <Text>{view.number ?? "Pro forma"}</Text>
            <Text style={styles.muted}>{new Date(view.issuedAt ?? view.orderDate).toLocaleDateString("fr-FR")}</Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.muted}>Client</Text>
          <Text>{view.customer.name}</Text>
          <Text>{view.customer.address}</Text>
          <Text>
            {view.customer.postalCode ? `${view.customer.postalCode} ` : ""}
            {view.customer.city} · {view.customer.country}
          </Text>
          <Text>{view.customer.email}</Text>
        </View>

        <View style={[styles.row, styles.head]}>
          <Text style={styles.cell}>Article</Text>
          <Text style={styles.cellRight}>Qté</Text>
          <Text style={styles.cellRight}>Prix</Text>
          <Text style={styles.cellRight}>Total</Text>
        </View>
        {view.items.map((item) => (
          <View key={item.ref} style={styles.row}>
            <Text style={styles.cell}>
              {item.title} ({item.ref})
            </Text>
            <Text style={styles.cellRight}>{item.quantity}</Text>
            <Text style={styles.cellRight}>{money(item.unitMinor, view.currency)}</Text>
            <Text style={styles.cellRight}>{money(item.unitMinor * item.quantity, view.currency)}</Text>
          </View>
        ))}

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Sous-total</Text>
          <Text style={styles.totalValue}>{money(view.subtotalMinor, view.currency)}</Text>
        </View>
        <View style={styles.total}>
          <Text style={styles.totalLabel}>Livraison</Text>
          <Text style={styles.totalValue}>{money(view.shippingMinor, view.currency)}</Text>
        </View>
        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{money(view.totalMinor, view.currency)}</Text>
        </View>

        <Text style={styles.footer}>
          Commande {view.orderNumber} · {view.paymentMethod === "cod" ? "Paiement à la livraison" : "Payée"}
        </Text>
      </Page>
    </Document>
  )
}

/** Renders the invoice view to a PDF blob in the browser, nothing goes through the api for the file itself. */
export async function renderInvoicePdf(view: InvoiceView): Promise<Blob> {
  return pdf(<InvoiceDocument view={view} />).toBlob()
}
