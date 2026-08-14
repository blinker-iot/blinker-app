export function getSavedFeedbackId(error: any): string | number | undefined {
  const candidates = [
    error,
    error?.data,
    error?.details,
    error?.details?.data,
    error?.error,
    error?.error?.data,
    error?.cause?.error,
    error?.cause?.error?.data,
  ];
  for (const candidate of candidates) {
    if (typeof candidate?.feedbackId === 'string' || typeof candidate?.feedbackId === 'number') {
      return candidate.feedbackId;
    }
  }
  return undefined;
}
