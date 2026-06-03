/**
 * reconcileSheetLeads — pure function, no hooks, no imports.
 *
 * Merges an array of leads from Google Sheets into the local leads array.
 *
 * Rules (NON-NEGOTIABLE):
 *   - Match by email (case-insensitive) first, then business name (case-insensitive).
 *   - For matched leads: ONLY profile fields may be updated.
 *   - NEVER overwrite: intelligence, accountKnowledge, activities, memory,
 *     followUps, touchLog, aiScore (unless sheet explicitly provides a value),
 *     seqLog, cadenceDay, files.
 *   - For unmatched leads: call addLead() with tags: ['Sheets'].
 *
 * @param {object[]} sheetLeads  — raw lead objects from the sheet
 * @param {object[]} localLeads  — current leads array from context
 * @param {function} addLead     — context.addLead()
 * @param {function} updateLead  — context.updateLead()
 * @returns {{ imported: number, updated: number }}
 */
export function reconcileSheetLeads(sheetLeads, localLeads, addLead, updateLead) {
  const results = { imported: 0, updated: 0 };
  const now = new Date().toISOString();

  sheetLeads.forEach(sheetLead => {
    if (!sheetLead) return;

    const existing = localLeads.find(l =>
      (l.email && sheetLead.email &&
        l.email.toLowerCase() === sheetLead.email.toLowerCase()) ||
      (l.business && sheetLead.business &&
        l.business.toLowerCase() === sheetLead.business.toLowerCase())
    );

    if (existing) {
      // Profile-only update — never touch intelligence, AK, activities, memory, etc.
      updateLead(existing.id, {
        business:  sheetLead.business  || existing.business,
        email:     sheetLead.email     || existing.email,
        phone:     sheetLead.phone     || existing.phone,
        city:      sheetLead.city      || existing.city,
        stage:     sheetLead.stage     || existing.stage,
        reviews:   sheetLead.reviews   || existing.reviews,
        updatedAt: now,
        // NOTE: aiScore intentionally omitted — local AI scoring takes precedence.
        // NEVER include: intelligence, accountKnowledge, activities, memory,
        //                followUps, touchLog, seqLog, cadenceDay, files.
      });
      results.updated++;
    } else {
      addLead({ ...sheetLead, tags: ['Sheets'], createdAt: now });
      results.imported++;
    }
  });

  return results;
}
