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
    payoneer: string
    payoneerStatic: string
    bankTitle: string
    holder: string
    bank: string
    bankAddress: string
    reference: string
    bankMissing: (email: string) => string
  }
  paymentReceived: {
    subject: (orderNumber: string) => string
  }
  paymentLink: {
    subject: (orderNumber: string) => string
    intro: string
  }
  shipped: {
    subject: (orderNumber: string) => string
    intro: string
    carrier: string
    trackingNumber: string
    track: string
    noTracking: string
    cod: (total: string) => string
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
      payoneer: "Merci, votre commande est réservée. Nous vous enverrons un lien de paiement Payoneer par email.",
      payoneerStatic: "Merci, votre commande est réservée. Payez avec le lien Payoneer ci-dessous, avec la référence.",
      bankTitle: "Coordonnées bancaires",
      holder: "Titulaire",
      bank: "Banque",
      bankAddress: "Adresse de la banque",
      reference: "Référence à indiquer",
      bankMissing: (email) => `Nos coordonnées bancaires suivent très vite, ou écrivez-nous : ${email}`,
    },
    paymentReceived: {
      subject: (n) => `Paiement reçu pour votre commande ${n}`,
    },
    paymentLink: {
      subject: (n) => `Votre lien de paiement pour la commande ${n}`,
      intro: "Voici votre lien de paiement Payoneer. Le montant et la référence sont ci-dessous.",
    },
    shipped: {
      subject: (n) => `Votre commande ${n} est en route`,
      intro: "Bonne nouvelle, votre commande a été expédiée.",
      carrier: "Transporteur",
      trackingNumber: "Numéro de suivi",
      track: "Suivre le colis :",
      noTracking: "Le transporteur vous contactera pour la livraison.",
      cod: (total) => `Prévoyez ${total} en espèces à la livraison.`,
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
      payoneer: "Thank you, your order is reserved. We will email you a Payoneer payment link.",
      payoneerStatic: "Thank you, your order is reserved. Pay with the Payoneer link below and add the reference.",
      bankTitle: "Bank details",
      holder: "Account holder",
      bank: "Bank",
      bankAddress: "Bank address",
      reference: "Reference to write",
      bankMissing: (email) => `Our bank details follow very soon, or write to us: ${email}`,
    },
    paymentReceived: {
      subject: (n) => `Payment received for your order ${n}`,
    },
    paymentLink: {
      subject: (n) => `Your payment link for order ${n}`,
      intro: "Here is your Payoneer payment link. The amount and the reference are below.",
    },
    shipped: {
      subject: (n) => `Your order ${n} is on its way`,
      intro: "Good news, your order has shipped.",
      carrier: "Carrier",
      trackingNumber: "Tracking number",
      track: "Track your parcel:",
      noTracking: "The carrier will contact you for the delivery.",
      cod: (total) => `Please have ${total} in cash ready on delivery.`,
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
      payoneer: "شكرا، تم حجز طلبك. سنرسل لك رابط دفع بايونير عبر البريد.",
      payoneerStatic: "شكرا، تم حجز طلبك. ادفع عبر رابط بايونير أدناه مع ذكر المرجع.",
      bankTitle: "البيانات البنكية",
      holder: "صاحب الحساب",
      bank: "البنك",
      bankAddress: "عنوان البنك",
      reference: "المرجع المطلوب كتابته",
      bankMissing: (email) => `ستصلك بياناتنا البنكية قريبا، أو راسلنا: ${email}`,
    },
    paymentReceived: {
      subject: (n) => `تم استلام الدفع لطلبك ${n}`,
    },
    paymentLink: {
      subject: (n) => `رابط الدفع لطلبك ${n}`,
      intro: "هذا رابط الدفع عبر بايونير. المبلغ والمرجع أدناه.",
    },
    shipped: {
      subject: (n) => `طلبك ${n} في الطريق إليك`,
      intro: "أخبار سارة، تم شحن طلبك.",
      carrier: "شركة الشحن",
      trackingNumber: "رقم التتبع",
      track: "تتبع الطرد:",
      noTracking: "ستتصل بك شركة الشحن لترتيب التسليم.",
      cod: (total) => `يرجى تجهيز ${total} نقدا عند التسليم.`,
    },
    expired: {
      subject: (n) => `تم إلغاء طلبك ${n}`,
      body: (days) => `لم نستلم دفعتك خلال ${days} أيام، لذلك تم إلغاء طلبك وعادت القطع للبيع.`,
      again: "راسلنا أو اطلب من جديد إذا كنت لا تزال ترغب بها.",
    },
  },
} satisfies Record<Locale, EmailCopy>

export const asLocale = (value: string): Locale => (value in EMAIL_COPY ? (value as Locale) : "fr")
