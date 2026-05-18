/**
 * Statum Citation Verification Service
 * Ensures AI assertions are grounded in valid Ugandan statutes.
 */

export interface Citation {
  text: string;
  source: string;
  isValid: boolean;
  referenceUrl?: string;
}

const VALID_STATUTES: Record<string, string> = {
  "Chapter 236": "Land Act (1998)",
  "Chapter 240": "Registration of Titles Act",
  "Article 237": "Constitution of Uganda (Land Ownership)",
  "Section 29": "Land Act (Rights of Lawful Occupants)",
  "Section 31": "Land Act (Ground Rent/Busuulu)",
  "Article 26": "Constitution of Uganda (Right to Property)",
};

export const verifyCitations = (text: string): Citation[] => {
  const results: Citation[] = [];
  
  // Extract patterns like "Chapter 236", "Article 26", "Section 31"
  const patterns = [
    /Chapter\s+(\d+)/gi,
    /Article\s+(\d+)/gi,
    /Section\s+(\d+)/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const statuteName = VALID_STATUTES[fullMatch] || null;
      
      results.push({
        text: fullMatch,
        source: statuteName || "General Statute",
        isValid: !!statuteName,
        referenceUrl: statuteName ? `https://ulii.org/search/node/${encodeURIComponent(fullMatch)}` : undefined
      });
    }
  });

  return results;
};

export const getVerificationSummary = (citations: Citation[]) => {
  const validCount = citations.filter(c => c.isValid).length;
  const total = citations.length;
  
  return {
    isFullyVerified: validCount === total && total > 0,
    trustScore: total > 0 ? (validCount / total) * 100 : 0,
    validCount,
    total
  };
};
