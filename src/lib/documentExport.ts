import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';
// @ts-ignore - file-saver doesn't have type definitions
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';


/**
 * Convert HTML content to plain text for export
 */
function htmlToPlainText(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

/**
 * Parse HTML content and create DOCX paragraphs
 */
function parseHTMLToDocxParagraphs(html: string): Paragraph[] {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const paragraphs: Paragraph[] = [];

    const processNode = (node: Node): TextRun[] => {
        const runs: TextRun[] = [];

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (text.trim()) {
                runs.push(new TextRun({ text }));
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            const tagName = element.tagName.toLowerCase();

            if (tagName === 'strong' || tagName === 'b') {
                const text = element.textContent || '';
                if (text.trim()) {
                    runs.push(new TextRun({ text, bold: true }));
                }
            } else if (tagName === 'em' || tagName === 'i') {
                const text = element.textContent || '';
                if (text.trim()) {
                    runs.push(new TextRun({ text, italics: true }));
                }
            } else if (tagName === 'u') {
                const text = element.textContent || '';
                if (text.trim()) {
                    runs.push(new TextRun({ text, underline: {} }));
                }
            } else {
                element.childNodes.forEach(child => {
                    runs.push(...processNode(child));
                });
            }
        }

        return runs;
    };

    temp.childNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            const tagName = element.tagName.toLowerCase();

            if (tagName === 'p') {
                const runs = processNode(element);
                if (runs.length > 0) {
                    paragraphs.push(new Paragraph({ children: runs }));
                } else {
                    paragraphs.push(new Paragraph({ text: '' }));
                }
            } else if (tagName === 'h1') {
                paragraphs.push(
                    new Paragraph({
                        text: element.textContent || '',
                        heading: HeadingLevel.HEADING_1,
                    })
                );
            } else if (tagName === 'h2') {
                paragraphs.push(
                    new Paragraph({
                        text: element.textContent || '',
                        heading: HeadingLevel.HEADING_2,
                    })
                );
            } else if (tagName === 'h3') {
                paragraphs.push(
                    new Paragraph({
                        text: element.textContent || '',
                        heading: HeadingLevel.HEADING_3,
                    })
                );
            } else if (tagName === 'ul' || tagName === 'ol') {
                element.querySelectorAll('li').forEach(li => {
                    paragraphs.push(
                        new Paragraph({
                            text: `• ${li.textContent || ''}`,
                        })
                    );
                });
            } else {
                const runs = processNode(element);
                if (runs.length > 0) {
                    paragraphs.push(new Paragraph({ children: runs }));
                }
            }
        }
    });

    return paragraphs;
}

/**
 * Export content as DOCX file
 */
export async function exportAsDocx(content: string, filename: string): Promise<void> {
    try {
        const paragraphs = parseHTMLToDocxParagraphs(content);

        const doc = new Document({
            sections: [
                {
                    properties: {},
                    children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ text: content })],
                },
            ],
        });

        const blob = await Packer.toBlob(doc);
        saveAs(blob, `${filename}.docx`);
    } catch (error) {
        console.error('Error exporting to DOCX:', error);
        throw new Error('Failed to export document as DOCX');
    }
}

/**
 * Export content as PDF file
 */
export async function exportAsPdf(content: string, filename: string, title?: string): Promise<void> {
    try {
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
        });

        // Set document properties
        pdf.setProperties({
            title: title || filename,
            subject: 'Legal Document',
            author: 'Kouti Legal Hub',
            creator: 'Kouti Legal Hub',
        });

        // Convert HTML to plain text for PDF
        const plainText = htmlToPlainText(content);

        // Set font and size
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');

        // Add title if provided
        if (title) {
            pdf.setFontSize(16);
            pdf.setFont('helvetica', 'bold');
            pdf.text(title, 20, 20);
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'normal');
        }

        // Split text into lines that fit the page width
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        const maxLineWidth = pageWidth - 2 * margin;
        const lineHeight = 7;
        let yPosition = title ? 35 : 20;

        const lines = pdf.splitTextToSize(plainText, maxLineWidth);

        lines.forEach((line: string) => {
            if (yPosition + lineHeight > pageHeight - margin) {
                pdf.addPage();
                yPosition = margin;
            }
            pdf.text(line, margin, yPosition);
            yPosition += lineHeight;
        });

        // Save the PDF
        pdf.save(`${filename}.pdf`);
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        throw new Error('Failed to export document as PDF');
    }
}

/**
 * Export contract with metadata as PDF
 */
export async function exportContractAsPdf(
    contractData: {
        title: string;
        content: string;
        type?: string;
        value?: number;
        currency?: string;
        startDate?: string;
        endDate?: string;
    },
    filename: string
): Promise<void> {
    try {
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        const maxLineWidth = pageWidth - 2 * margin;
        let yPosition = margin;

        // Title
        pdf.setFontSize(18);
        pdf.setFont('helvetica', 'bold');
        pdf.text(contractData.title, margin, yPosition);
        yPosition += 12;

        // Contract metadata
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');

        if (contractData.type) {
            pdf.text(`Type: ${contractData.type}`, margin, yPosition);
            yPosition += 6;
        }

        if (contractData.value && contractData.currency) {
            pdf.text(`Value: ${contractData.currency} ${contractData.value.toLocaleString()}`, margin, yPosition);
            yPosition += 6;
        }

        if (contractData.startDate || contractData.endDate) {
            const dateText = `Period: ${contractData.startDate || 'N/A'} to ${contractData.endDate || 'N/A'}`;
            pdf.text(dateText, margin, yPosition);
            yPosition += 6;
        }

        // Separator
        yPosition += 5;
        pdf.setLineWidth(0.5);
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;

        // Content
        pdf.setFontSize(11);
        const plainText = htmlToPlainText(contractData.content);
        const lines = pdf.splitTextToSize(plainText, maxLineWidth);
        const lineHeight = 7;

        lines.forEach((line: string) => {
            if (yPosition + lineHeight > pageHeight - margin) {
                pdf.addPage();
                yPosition = margin;
            }
            pdf.text(line, margin, yPosition);
            yPosition += lineHeight;
        });

        pdf.save(`${filename}.pdf`);
    } catch (error) {
        console.error('Error exporting contract to PDF:', error);
        throw new Error('Failed to export contract as PDF');
    }
}
