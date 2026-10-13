const SYMBOLS = { XOF: "F", XAF: "F", EUR: "€", USD: "$", RUB: "₽", GBP: "£" };
const numberFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// 9500, "XOF" → "9 500 F" (mêmes règles que l'affichage du site)
export const formatMoney = (amount, currency) => `${numberFmt.format(amount)} ${SYMBOLS[currency] ?? currency}`;
export const formatKilos = (kilos) => `${numberFmt.format(kilos)} kg`;
