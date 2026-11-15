export type Locale = "fr" | "en" | "ar"

export interface EmailCopy {
  common: {
    hello: (name: string) => string
    subtotal: string
    shipping: string
    total: string
    link: string
    invoiceLink: string
    bye: string
  }
  confirmation: {
    subject: (orderNumber: string) => string
    paid: string
    cod: string
    transfer: string
    bankTitle: string
    holder: string
    bank: string
    reference: string
    bankMissing: (email: string) => string
  }
  paymentReceived: {
    subject: (orderNumber: string) => string
  }
}

export const EMAIL_COPY = {
  fr: {
    common: {
      hello: (name) => `Bonjour ${name},`,
      subtotal: "Sous-total",
      shipping: "Livraison",
      total: "Total",
      link: "Suivre votre commande :",
      invoiceLink: "Votre facture :",
      bye: "Ceraghit Creation",
    },
    confirmation: {
      subject: (n) => `Votre commande ${n} chez Ceraghit`,
      paid: "Merci, nous avons bien reçu votre paiement.",
      cod: "Merci, votre commande est confirmée. Vous réglez en espèces à la livraison.",
      transfer: "Merci, votre commande est réservée. Elle sera expédiée dès réception de votre virement.",
      bankTitle: "Coordonnées bancaires",
      holder: "Titulaire",
      bank: "Banque",
      reference: "Référence à indiquer",
      bankMissing: (email) => `Nos coordonnées bancaires suivent très vite, ou écrivez-nous : ${email}`,
    },
    paymentReceived: {
      subject: (n) => `Paiement reçu pour votre commande ${n}`,
    },
  },
  en: {
    common: {
      hello: (name) => `Hello ${name},`,
      subtotal: "Subtotal",
      shipping: "Shipping",
      total: "Total",
      link: "Follow your order:",
      invoiceLink: "Your invoice:",
      bye: "Ceraghit Creation",
    },
    confirmation: {
      subject: (n) => `Your Ceraghit order ${n}`,
      paid: "Thank you, we received your payment.",
      cod: "Thank you, your order is confirmed. You pay in cash on delivery.",
      transfer: "Thank you, your order is reserved. It ships as soon as we receive your transfer.",
      bankTitle: "Bank details",
      holder: "Account holder",
      bank: "Bank",
      reference: "Reference to write",
      bankMissing: (email) => `Our bank details follow very soon, or write to us: ${email}`,
    },
    paymentReceived: {
      subject: (n) => `Payment received for your order ${n}`,
    },
  },
  ar: {
    common: {
      hello: (name) => `مرحبا ${name}،`,
      subtotal: "المجموع الفرعي",
      shipping: "التوصيل",
      total: "المجموع",
      link: "يمكنك متابعة طلبك من هنا:",
      invoiceLink: "فاتورتك:",
      bye: "Ceraghit Creation",
    },
    confirmation: {
      subject: (n) => `طلبك ${n} من سيراغيت`,
      paid: "شكرا، لقد استلمنا دفعتك.",
      cod: "شكرا، تم تأكيد طلبك. الدفع نقدا عند التسليم.",
      transfer: "شكرا، تم حجز طلبك. سيتم شحنه فور استلام التحويل.",
      bankTitle: "البيانات البنكية",
      holder: "صاحب الحساب",
      bank: "البنك",
      reference: "المرجع المطلوب كتابته",
      bankMissing: (email) => `ستصلك بياناتنا البنكية قريبا، أو راسلنا: ${email}`,
    },
    paymentReceived: {
      subject: (n) => `تم استلام الدفع لطلبك ${n}`,
    },
  },
} satisfies Record<Locale, EmailCopy>

export const asLocale = (value: string): Locale => (value in EMAIL_COPY ? (value as Locale) : "fr")
