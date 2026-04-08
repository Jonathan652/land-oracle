
export const generatePDF = async (content: string, title: string) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - (margin * 2);

  // Content
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  
  // Clean markdown for PDF (simple version)
  const cleanContent = content
    .replace(/[#*`]/g, '')
    .replace(/\n\s*\n/g, '\n\n');

  const splitText = doc.splitTextToSize(cleanContent, maxWidth);
  const pageHeight = doc.internal.pageSize.getHeight();
  let cursorY = 20;

  for (let i = 0; i < splitText.length; i++) {
    if (cursorY > pageHeight - 30) {
      doc.addPage();
      cursorY = 20;
    }
    doc.text(splitText[i], margin, cursorY);
    cursorY += 7; // Line height
  }

  // Footer Disclaimer
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25);
  
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const disclaimer = "For guidance only—not legal advice. Consult a lawyer for specific cases.";
  const splitDisclaimer = doc.splitTextToSize(disclaimer, maxWidth);
  doc.text(splitDisclaimer, margin, pageHeight - 15);

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  
  // Trigger download
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/\s+/g, '_')}.pdf`;
  link.click();
  
  return url;
};

export const generateDOCX = async (content: string, title: string) => {
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const { saveAs } = await import('file-saver');
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        ...content.split('\n').map(line => new Paragraph({
          children: [new TextRun(line.replace(/[#*`]/g, ''))],
          spacing: { before: 200 },
        })),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Disclaimer: For guidance only—not legal advice. Consult a lawyer for specific cases.",
              italics: true,
              size: 16,
            }),
          ],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  saveAs(blob, `${title.replace(/\s+/g, '_')}.docx`);
  return url;
};
