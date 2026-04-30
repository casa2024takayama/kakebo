export type ReceiptResult = {
  amount: number
  date: string
  memo: string
}

export async function readReceipt(
  apiKey: string,
  imageBase64: string,
  mediaType: string,
): Promise<ReceiptResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: 'このレシートから合計金額・日付・店名を読み取り、必ずJSONのみで返してください。形式: {"amount": 1234, "date": "2026-04-30", "memo": "店名"}',
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? '{}'
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('レスポンスのパースに失敗しました')
  return JSON.parse(match[0]) as ReceiptResult
}
