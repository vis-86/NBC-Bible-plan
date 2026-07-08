'use client';

import { useEffect } from 'react';
import { installChunkGuard } from '@/shared/offline/chunkGuard';

/**
 * Без UI — монтируется первым в root layout, до остальных провайдеров, чтобы
 * ловить ChunkLoadError максимально рано (см. chunkGuard.ts).
 */
export default function ChunkGuard() {
  useEffect(() => installChunkGuard(), []);
  return null;
}
