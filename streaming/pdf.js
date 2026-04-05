import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fileBase64 } = req.body;
  if (!fileBase64) return res.status(400).json({ error: 'No file data received.' });

  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    const data   = await pdfParse(buffer);
    const text   = data.text.trim();

    if (!text) {
      return res.status(422).json({
        error: 'Could not extract text. The PDF may be image-based or scanned.',
      });
    }

    res.json({ text });
  } catch (err) {
    console.error('PDF error:', err.message);
    res.status(500).json({ error: 'PDF parsing failed: ' + err.message });
  }
}
