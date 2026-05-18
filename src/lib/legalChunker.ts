/**
 * Legal-Aware Chunking Algorithm for Statum AI
 * Preserves hierarchy: [DOCUMENT] -> [SECTION] -> [CLAUSE]
 */

export interface LegalChunk {
  id: string;
  documentTitle: string;
  citationId: string; // e.g. UG-LANDACT-236-SEC-29
  content: string;
  metadata: {
    sectionNumber?: string;
    sectionTitle?: string;
    level: 'act' | 'section' | 'clause' | 'schedule';
    parentCitation?: string;
  };
}

export const chunkLegalText = (text: string, fileName: string): LegalChunk[] => {
  const chunks: LegalChunk[] = [];
  const lines = text.split('\n');
  
  let currentSectionTitle = "";
  let currentSectionNumber = "";
  let buffer = "";
  
  // Basic heuristic: Ugandan laws often use "Section X." or "X. [Title]"
  const sectionRegex = /^(Section\s+)?(\d+)\.\s+(.*)/i;

  lines.forEach((line, index) => {
    const isSectionStart = sectionRegex.test(line.trim());
    
    if (isSectionStart && buffer.length > 0) {
      // Flush previous section
      chunks.push({
        id: `chunk-${Date.now()}-${index}`,
        documentTitle: fileName,
        citationId: `${fileName}-SEC-${currentSectionNumber}`,
        content: buffer.trim(),
        metadata: {
          sectionNumber: currentSectionNumber,
          sectionTitle: currentSectionTitle,
          level: 'section'
        }
      });
      buffer = "";
    }

    if (isSectionStart) {
      const match = line.trim().match(sectionRegex);
      if (match) {
        currentSectionNumber = match[2];
        currentSectionTitle = match[3];
      }
    }

    buffer += line + "\n";
  });

  // Flush final chunk
  if (buffer.length > 0) {
    chunks.push({
      id: `chunk-final-${Date.now()}`,
      documentTitle: fileName,
      citationId: `${fileName}-SEC-${currentSectionNumber}`,
      content: buffer.trim(),
      metadata: {
        sectionNumber: currentSectionNumber,
        sectionTitle: currentSectionTitle,
        level: 'section'
      }
    });
  }

  return chunks;
};
