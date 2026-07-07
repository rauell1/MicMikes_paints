import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { queryLogs } from "../db/schema/search";

export class SearchService {
  /**
   * Search catalog variants using pg_trgm / tsvector full text search and rank weight multipliers.
   */
  static async search(
    queryText: string,
    filters?: {
      shadeFamily?: string;
      finish?: string;
      priceMax?: number;
      isExterior?: boolean;
    },
    customerId?: string,
    sessionId?: string
  ) {
    try {
      // Clean query text for tsquery (e.g. "matte red" -> "matte:* & red:*")
      const words = queryText
        .trim()
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(/\s+/)
        .filter(Boolean);

      const formattedQuery = words.map((w) => `${w}:*`).join(" & ");

      let queryCondition = sql`TRUE`;
      if (formattedQuery) {
        queryCondition = sql`searchable_text @@ to_tsquery('english', ${formattedQuery})`;
      }

      let query = sql`
        SELECT 
          variant_id AS "variantId", 
          product_id AS "productId", 
          vendor_id AS "vendorId", 
          filter_json AS "filterJson", 
          ranking_features AS "rankingFeatures",
          ${formattedQuery ? sql`ts_rank(searchable_text, to_tsquery('english', ${formattedQuery}))` : sql`1.0`} AS rank
        FROM search.product_documents
        WHERE ${queryCondition}
      `;

      // Apply JSONB filters
      if (filters?.shadeFamily) {
        query = sql`${query} AND filter_json->>'shade_family' = ${filters.shadeFamily}`;
      }
      if (filters?.finish) {
        query = sql`${query} AND filter_json->>'finish' = ${filters.finish}`;
      }
      if (filters?.priceMax) {
        // Compare minor units (cents)
        query = sql`${query} AND (filter_json->>'price_minor')::int <= ${filters.priceMax * 100}`;
      }
      if (filters?.isExterior !== undefined) {
        query = sql`${query} AND (filter_json->>'is_exterior')::boolean = ${filters.isExterior}`;
      }

      // Order by Rank * Featured Weight * Recency Weight
      query = sql`
        ${query}
        ORDER BY (
          rank * 
          COALESCE((ranking_features->>'featured_weight')::numeric, 1.0) * 
          COALESCE((ranking_features->>'recency_weight')::numeric, 1.0)
        ) DESC
      `;

      const rows = (await db.execute(query)).rows as any[];

      // Log the search query in query_logs asynchronously
      if (queryText) {
        await db.insert(queryLogs).values({
          customerId: customerId || null,
          sessionId: sessionId || null,
          queryText,
          resultCount: rows.length,
        }).catch((err) => console.error("[SearchService] Query logging failed:", err));
      }

      return rows;
    } catch (err) {
      console.error("[SearchService] Search failed:", err);
      throw err;
    }
  }
}
