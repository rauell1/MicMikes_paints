import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as iam from "./schema/iam";
import * as vendor from "./schema/vendor";
import * as catalog from "./schema/catalog";
import * as customer from "./schema/customer";
import * as commerce from "./schema/commerce";
import * as payment from "./schema/payment";
import * as delivery from "./schema/delivery";
import * as search from "./schema/search";
import * as analytics from "./schema/analytics";
import * as integration from "./schema/integration";
import * as regulatory from "./schema/regulatory";

const schema = {
  ...iam,
  ...vendor,
  ...catalog,
  ...customer,
  ...commerce,
  ...payment,
  ...delivery,
  ...search,
  ...analytics,
  ...integration,
  ...regulatory
};

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
