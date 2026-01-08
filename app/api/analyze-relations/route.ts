import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const BATCH_SIZE = 50;

interface TopicInput {
  number: number;
  name: string;
}

interface AnalysisResult {
  clusters: Record<string, number[]>;
  relations: { topic: number; related: number[] }[];
  prerequisites: { topic: number; requires: number[] }[];
}

async function analyzeBatch(
  anthropic: Anthropic,
  topics: TopicInput[],
  subjectName: string,
  batchNum: number,
  totalBatches: number
): Promise<{ result: AnalysisResult; inputTokens: number; outputTokens: number }> {

  console.log(`[ANALYZE-RELATIONS] Processing batch ${batchNum}/${totalBatches} (${topics.length} topics)`);

  const topicList = topics.map(t => `${t.number}. ${t.name}`).join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Анализирай следните теми от предмет "${subjectName}" и определи техните връзки.

ТЕМИ:
${topicList}

ЗАДАЧА:
1. КЛЪСТЕРИ - групирай свързани теми в логически категории
   - Например: "Пулмология", "Кардиология", "Ендокринология"

2. СВЪРЗАНИ ТЕМИ - определи кои теми са тематично свързани

3. PREREQUISITES - коя тема трябва да се научи ПРЕДИ друга

ОТГОВОРИ САМО С ВАЛИДЕН JSON (без markdown, без \`\`\`):
{
  "clusters": {
    "Име на клъстер": [номера на темите като числа]
  },
  "relations": [
    {"topic": номер, "related": [номера на свързани теми]}
  ],
  "prerequisites": [
    {"topic": номер, "requires": [номера на теми които трябва първо]}
  ]
}

ВАЖНО:
- Използвай САМО номерата (числа), не имена
- Не всички теми имат prerequisites
- Върни САМО JSON, без никакви обяснения или markdown`
    }]
  });

  const textContent = message.content.find(block => block.type === 'text');
  const responseText = textContent?.text || '{}';

  // Clean and parse JSON
  let cleanedResponse = responseText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '');

  const firstBrace = cleanedResponse.indexOf('{');
  const lastBrace = cleanedResponse.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
  }

  cleanedResponse = cleanedResponse
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .trim();

  const parsed = JSON.parse(cleanedResponse);

  return {
    result: {
      clusters: parsed.clusters || {},
      relations: parsed.relations || [],
      prerequisites: parsed.prerequisites || []
    },
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens
  };
}

function mergeResults(results: AnalysisResult[]): AnalysisResult {
  const merged: AnalysisResult = {
    clusters: {},
    relations: [],
    prerequisites: []
  };

  for (const result of results) {
    // Merge clusters
    for (const [clusterName, topicIds] of Object.entries(result.clusters)) {
      if (merged.clusters[clusterName]) {
        // Add unique topic IDs
        const existing = new Set(merged.clusters[clusterName]);
        for (const id of topicIds) {
          existing.add(id);
        }
        merged.clusters[clusterName] = Array.from(existing).sort((a, b) => a - b);
      } else {
        merged.clusters[clusterName] = [...topicIds];
      }
    }

    // Merge relations
    for (const rel of result.relations) {
      const existing = merged.relations.find(r => r.topic === rel.topic);
      if (existing) {
        const relatedSet = new Set(existing.related);
        for (const id of rel.related) {
          relatedSet.add(id);
        }
        existing.related = Array.from(relatedSet).sort((a, b) => a - b);
      } else {
        merged.relations.push({ ...rel });
      }
    }

    // Merge prerequisites
    for (const prereq of result.prerequisites) {
      const existing = merged.prerequisites.find(p => p.topic === prereq.topic);
      if (existing) {
        const reqSet = new Set(existing.requires);
        for (const id of prereq.requires) {
          reqSet.add(id);
        }
        existing.requires = Array.from(reqSet).sort((a, b) => a - b);
      } else {
        merged.prerequisites.push({ ...prereq });
      }
    }
  }

  // Sort relations and prerequisites by topic number
  merged.relations.sort((a, b) => a.topic - b.topic);
  merged.prerequisites.sort((a, b) => a.topic - b.topic);

  return merged;
}

export async function POST(request: NextRequest) {
  console.log('[ANALYZE-RELATIONS] === REQUEST STARTED ===');

  try {
    const { topics, subjectName, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 400 });
    }

    if (!topics || topics.length < 3) {
      return NextResponse.json({ error: 'Нужни са поне 3 теми за анализ' }, { status: 400 });
    }

    if (!subjectName) {
      return NextResponse.json({ error: 'Missing subject name' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    // Split into batches
    const batches: TopicInput[][] = [];
    for (let i = 0; i < topics.length; i += BATCH_SIZE) {
      batches.push(topics.slice(i, i + BATCH_SIZE));
    }

    console.log(`[ANALYZE-RELATIONS] Subject: ${subjectName}, Topics: ${topics.length}, Batches: ${batches.length}`);

    // Process all batches
    const results: AnalysisResult[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let i = 0; i < batches.length; i++) {
      try {
        const { result, inputTokens, outputTokens } = await analyzeBatch(
          anthropic,
          batches[i],
          subjectName,
          i + 1,
          batches.length
        );
        results.push(result);
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
      } catch (e) {
        console.error(`[ANALYZE-RELATIONS] Batch ${i + 1} failed:`, e);
        // Continue with other batches
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'Всички batch-ове се провалиха' }, { status: 500 });
    }

    // Merge all results
    const merged = mergeResults(results);

    // Sonnet pricing: $3/1M input, $15/1M output
    const cost = (totalInputTokens * 0.003 + totalOutputTokens * 0.015) / 1000;

    console.log(`[ANALYZE-RELATIONS] Success. Batches: ${results.length}/${batches.length}, Clusters: ${Object.keys(merged.clusters).length}`);

    return NextResponse.json({
      clusters: merged.clusters,
      relations: merged.relations,
      prerequisites: merged.prerequisites,
      batchInfo: batches.length > 1 ? `Анализирани в ${batches.length} части` : undefined,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cost: Math.round(cost * 1000000) / 1000000
      }
    });

  } catch (error: unknown) {
    console.error('[ANALYZE-RELATIONS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('invalid_api_key')) {
      return NextResponse.json({ error: 'Невалиден API ключ' }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
