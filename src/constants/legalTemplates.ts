
export interface LegalTemplate {
  id: string;
  title: string;
  keywords: string[];
  content: string;
  language: 'en' | 'lg' | 'runy';
}

export const LEGAL_TEMPLATES: LegalTemplate[] = [
  {
    id: 'sale-agreement-en',
    title: 'Agreement for Sale of Land',
    keywords: ['sale', 'agreement', 'sell', 'buy', 'land sale', 'contract', 'endagaano', 'okutunda', 'ettaka', 'land purchase'],
    language: 'en',
    content: `
# AGREEMENT FOR THE SALE OF LAND

**BETWEEN:**

**[SELLER NAME]** of [SELLER ADDRESS] (hereinafter referred to as the "Vendor")

**AND:**

**[BUYER NAME]** of [BUYER ADDRESS] (hereinafter referred to as the "Purchaser")

**WHEREAS:**
The Vendor is the registered proprietor / rightful owner of the piece of land situated at [LOCATION], measuring approximately [SIZE], and more particularly described as [DESCRIPTION/PLOT NO].

**NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:**

1. **PURCHASE PRICE:**
   The purchase price for the said land is UGX [AMOUNT] (Uganda Shillings [AMOUNT IN WORDS]).

2. **PAYMENT TERMS:**
   The Purchaser has paid a deposit of UGX [DEPOSIT] on the signing of this agreement (receipt whereof the Vendor acknowledges). The balance of UGX [BALANCE] shall be paid on or before [DATE].

3. **POSSESSION:**
   The Vendor shall deliver vacant possession of the land to the Purchaser upon full payment of the purchase price.

4. **TRANSFER OF TITLE:**
   The Vendor shall execute all necessary transfer documents in favor of the Purchaser upon completion of payment.

5. **WITNESSES:**
   This agreement is signed in the presence of:
   
   Vendor's Witness: ________________________
   Purchaser's Witness: ________________________

**SIGNED BY:**

________________________            ________________________
Vendor                               Purchaser

Date: [CURRENT DATE]
    `
  },
  {
    id: 'sale-agreement-runy',
    title: 'Endagaano y\'okutunda ne kugura eitaka',
    keywords: ['tunda', 'eitaka', 'endagaano', 'gura'],
    language: 'runy',
    content: `
# ENDAGAANO Y'OKUTUNDA NE KUGURA EITAKA

**AHAGATI YA:**

**[SELLER NAME]** ow'e [SELLER ADDRESS] (ayayitibwa "Omutunzi")

**NE:**

**[BUYER NAME]** ow'e [BUYER ADDRESS] (ayayitibwa "Omuguzi")

**OKWIKIRIZANA:**
1. Omutunzi ayikiriza okutunda eitaka erye erisangibwa [LOCATION], liisize [SIZE].
2. Omuhendo gw'eitaka gwikirizanisibwa okuba UGX [AMOUNT].
    `
  },
  {
    id: 'tenancy-agreement-en',
    title: 'Tenancy Agreement',
    keywords: ['rent', 'tenant', 'landlord', 'tenancy', 'house', 'lease'],
    language: 'en',
    content: `
# TENANCY AGREEMENT

**THIS AGREEMENT** is made this [DAY] day of [MONTH], [YEAR]

**BETWEEN:**

**[LANDLORD NAME]** (hereinafter called the "Landlord")

**AND:**

**[TENANT NAME]** (hereinafter called the "Tenant")

**1. PREMISES:**
   The Landlord agrees to let and the Tenant agrees to take the premises situated at [LOCATION] for residential/commercial purposes.

**2. DURATION:**
   The tenancy shall be for a period of [DURATION] commencing on [START DATE].

**3. RENT:**
   The rent shall be UGX [AMOUNT] per month, payable in advance on the [DAY] of every month.

**4. SECURITY DEPOSIT:**
   The Tenant shall pay a security deposit of UGX [DEPOSIT] to cover any damages or unpaid bills.

**5. TENANT'S OBLIGATIONS:**
   - To pay rent on time.
   - To keep the premises clean and in good repair.
   - Not to sublet the premises without written consent.

**6. LANDLORD'S OBLIGATIONS:**
   - To ensure the premises are fit for habitation.
   - To pay property taxes and major structural repairs.

**SIGNED:**

________________________            ________________________
Landlord                             Tenant
    `
  },
  {
    id: 'sale-agreement-lg',
    title: 'Endagaano y\'Okukola n\'Okutunda Ettaka',
    keywords: ['tunda', 'ttaka', 'endagaano', 'gula'],
    language: 'lg',
    content: `
# ENDAGAANO Y'OKUTUNDA ETTAKA

**WAKATI WA:**

**[SELLER NAME]** ow'e [SELLER ADDRESS] (ayayitibwa "Omutunzi")

**NE:**

**[BUYER NAME]** ow'e [BUYER ADDRESS] (ayayitibwa "Omuguzi")

**OKUKKIRIZIGANYA:**

1. Omutunzi akkiriza okutunda ettaka lye erisangibwa e [LOCATION], liisize [SIZE], Plot [PLOT NO].
2. Omuwendo gw'ettaka gukkiriziganyiddwa okuba UGX [AMOUNT].
3. Omuguzi asasuddeko emitwalo [DEPOSIT] leero ku kussaako omukono.
    `
  }
];

export const findTemplate = (userInput: string, language: string): LegalTemplate | null => {
  const inputLower = userInput.toLowerCase();
  return LEGAL_TEMPLATES.find(t => 
    t.language === language && 
    t.keywords.some(k => inputLower.includes(k))
  ) || null;
};
