import {
  CIAN_ADAPTER_VERSION,
  CIAN_PARSER_VERSION,
  CIAN_SOURCE_ID,
  CIAN_SUPPORTED_FIELDS,
} from "../../config";
import type { HttpCollector } from "../../contracts";
import { MarketplaceHttpAdapter } from "../marketplace-http-adapter";
import { parseCianOfferCard } from "./parser";

export const createCianHttpAdapter = (
  collector: HttpCollector,
): MarketplaceHttpAdapter =>
  new MarketplaceHttpAdapter(
    {
      sourceId: CIAN_SOURCE_ID,
      adapterVersion: CIAN_ADAPTER_VERSION,
      parserVersion: CIAN_PARSER_VERSION,
      supportedFields: CIAN_SUPPORTED_FIELDS,
      parse: parseCianOfferCard,
    },
    collector,
  );
