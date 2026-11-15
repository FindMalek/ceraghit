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
    reason: string
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
  expired: {
    subject: (orderNumber: string) => string
    body: (days: number) => string
    again: string
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
      reason: "Vous recevez cet email car vous avez commandé chez Ceraghit Creation.",
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
    expired: {
      subject: (n) => `Votre commande ${n} a été annulée`,
      body: (days) =>
        `Nous n'avons pas reçu votre paiement sous ${days} jours, votre commande a donc été annulée et les pièces sont de nouveau en vente.`,
      again: "Répondez à cet email ou commandez à nouveau si les pièces vous intéressent toujours.",
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
      reason: "You are receiving this email because you ordered from Ceraghit Creation.",
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
    expired: {
      subject: (n) => `Your order ${n} was cancelled`,
      body: (days) =>
        `We did not receive your payment within ${days} days, so your order was cancelled and the pieces are back on sale.`,
      again: "Reply to this email or order again if you still want them.",
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
      reason: "وصلتك هذه الرسالة لأنك طلبت من Ceraghit Creation.",
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
    expired: {
      subject: (n) => `تم إلغاء طلبك ${n}`,
      body: (days) => `لم نستلم دفعتك خلال ${days} أيام، لذلك تم إلغاء طلبك وعادت القطع للبيع.`,
      again: "راسلنا أو اطلب من جديد إذا كنت لا تزال ترغب بها.",
    },
  },
} satisfies Record<Locale, EmailCopy>

export const asLocale = (value: string): Locale => (value in EMAIL_COPY ? (value as Locale) : "fr")
