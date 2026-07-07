export interface RankingFeatures {
  featured_weight?: number;
  recency_weight?: number;
  sales_weight?: number;
}

export class SearchRanking {
  /**
   * Compute the weighted relevance score for search results.
   */
  static calculateRelevanceScore(baseRank: number, features?: RankingFeatures): number {
    const featured = features?.featured_weight ?? 1.0;
    const recency = features?.recency_weight ?? 1.0;
    const sales = features?.sales_weight ?? 1.0;

    return baseRank * featured * recency * sales;
  }
}
