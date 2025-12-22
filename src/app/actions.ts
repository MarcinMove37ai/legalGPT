"use server"

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getDecisionsAction() {
  // FIX: Model 'Decision' został usunięty.
  // Zwracamy pustą tablicę, aby uniknąć błędów kompilacji,
  // zachowując jednocześnie strukturę funkcji dla kompatybilności.
  return { success: true, data: [] };
}

// NOWA FUNKCJA: Pobieranie statystyk statusów
export async function getDecisionStatsAction() {
  // FIX: Model 'Decision' został usunięty.
  // Zwracamy wyzerowane statystyki.
  const emptyStats = {
    total: 0,
    new: 0,
    in_progress: 0,
    pending: 0,
    closed: 0,
  };

  return { success: true, data: emptyStats };
}