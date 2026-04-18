
export const generatePDF = async (content: string, title: string) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - (margin * 2);

  // Background - Cream/Professional
  doc.setFillColor(253, 250, 245); // #FDFAF5
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  let cursorY = 25;

  // Title with Accent Bar
  doc.setFillColor(197, 160, 89); // #C5A059 (Gold)
  doc.rect(margin, cursorY - 5, 2, 10, 'F');
  
  doc.setTextColor(139, 110, 55); // #8B6E37 (Dark Gold)
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text(title.toUpperCase(), margin + 8, cursorY);
  cursorY += 20;

  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.trim() === '') {
      cursorY += 6;
      continue;
    }

    // Handle Headers (#)
    if (line.startsWith('#')) {
      const headerText = line.replace(/^[#\s]+/, '').toUpperCase();
      doc.setFont('times', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(11, 15, 26); // #0B0F1A
      
      const wrappedHeader = doc.splitTextToSize(headerText, maxWidth);
      for (const hLine of wrappedHeader) {
        if (cursorY > pageHeight - 30) {
          doc.addPage();
          doc.setFillColor(253, 250, 245);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          cursorY = 25;
        }
        doc.text(hLine, margin, cursorY);
        cursorY += 8;
      }
      cursorY += 4;
      continue;
    }

    // Default Body Text
    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(26, 31, 46); // #1A1F2E

    // Enhanced Bold Support (**text**)
    const processLine = (text: string, x: number, y: number) => {
      const parts = text.split('**');
      let currentX = x;
      parts.forEach((part, index) => {
        if (index % 2 === 1) {
          doc.setFont('times', 'bold');
          doc.setTextColor(11, 15, 26);
        } else {
          doc.setFont('times', 'normal');
          doc.setTextColor(26, 31, 46);
        }
        
        // This is a simplified approach; real inline bolding is complex in jsPDF
        // For now, we'll treat lines with ** as entirely bolded if they fit legal pattern
        if (text.includes('**')) {
           doc.setFont('times', 'bold');
        }
      });
    };

    const isBoldLine = line.includes('**') || /^Clause \d/i.test(line) || /^\d+\.\d+/i.test(line);
    if (isBoldLine) {
      doc.setFont('times', 'bold');
      doc.setTextColor(11, 15, 26);
    }

    const cleanLine = line.replace(/\*\*/g, '');
    const wrappedBody = doc.splitTextToSize(cleanLine, maxWidth);
    
    for (const bLine of wrappedBody) {
      if (cursorY > pageHeight - 30) {
        doc.addPage();
        doc.setFillColor(253, 250, 245);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        cursorY = 25;
      }
      doc.text(bLine, margin, cursorY);
      cursorY += 7;
    }
  }

  // Institutional Footer
  doc.setDrawColor(197, 160, 89);
  doc.setLineWidth(0.5);
  doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
  
  doc.setFontSize(9);
  doc.setTextColor(139, 110, 55);
  doc.setFont('times', 'italic');
  const footerNote = `Statum Legal Intelligence - Professional Draft - ${new Date().toLocaleDateString()}`;
  doc.text(footerNote, margin, pageHeight - 12);

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/\s+/g, '_')}.pdf`;
  link.click();
  
  return url;
};

export const generateDOCX = async (content: string, title: string) => {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle } = await import('docx');
  const { saveAs } = await import('file-saver');
  
  const lines = content.split('\n');
  const children = [];

  // Title
  children.push(new Paragraph({
    children: [
      new TextRun({
        text: title.toUpperCase(),
        bold: true,
        size: 32, // 16pt
        font: "Times New Roman",
        color: "8B6E37",
      }),
    ],
    border: {
      left: {
        color: "C5A059",
        space: 10,
        style: BorderStyle.SINGLE,
        size: 24,
      },
    },
    spacing: { after: 600 },
  }));

  for (const line of lines) {
    if (line.trim() === '') {
      children.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    const isHeader = line.startsWith('#');
    const isBold = line.includes('**') || /^Clause \d/i.test(line) || /^\d+\.\d+/i.test(line);

    children.push(new Paragraph({
      children: [
        new TextRun({
          text: line.replace(/[#*]/g, '').trim().toUpperCase(),
          bold: isBold || isHeader,
          size: isHeader ? 28 : 22,
          font: "Times New Roman",
          color: isHeader ? "0B0F1A" : "1A1F2E",
        }),
      ],
      spacing: { before: isHeader ? 300 : 120, after: 120 },
    }));
  }

  // Institutional Footer
  children.push(new Paragraph({ spacing: { before: 800 } }));
  children.push(new Paragraph({
    children: [
      new TextRun({
        text: `Statum Legal Intelligence - Professional Draft - ${new Date().toLocaleDateString()}`,
        color: "8B6E37",
        size: 18,
        italics: true,
        font: "Times New Roman",
      }),
    ],
    alignment: AlignmentType.CENTER,
  }));

  const doc = new Document({
    sections: [{
      properties: {},
      children: children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  saveAs(blob, `${title.replace(/\s+/g, '_')}.docx`);
  return url;
};
