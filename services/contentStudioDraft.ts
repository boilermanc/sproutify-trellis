/** Notify the studio shell about user-triggered draft changes outside native inputs. */
export function markStudioDraftChanged(): void {
  window.dispatchEvent(new Event('studio-draft-change', { bubbles: true }));
}
