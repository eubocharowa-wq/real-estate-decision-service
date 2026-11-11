import {
  AVITO_ADAPTER_VERSION,
  AVITO_PARSER_VERSION,
  AVITO_SOURCE_ID,
  AVITO_SUPPORTED_FIELDS,
} from "../../config";
import type { HttpCollector } from "../../contracts";
import { MarketplaceHttpAdapter } from "../marketplace-http-adapter";
import { parseAvitoOfferCard } from "./parser";

export const createAvitoHttpAdapter = (
  collector: HttpCollector,
): MarketplaceHttpAdapter =>
  new MarketplaceHttpAdapter(
    {
      sourceId: AVITO_SOURCE_ID,
      adapterVersion: AVITO_ADAPTER_VERSION,
      parserVersion: AVITO_PARSER_VERSION,
      supportedFields: AVITO_SUPPORTED_FIELDS,
      parse: parseAvitoOfferCard,
    },
    collector,
  );
