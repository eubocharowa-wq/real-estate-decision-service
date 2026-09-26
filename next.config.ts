import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The readiness route compares the deployed schema with the checked-in SQL
  // catalogue. Include those non-JavaScript files in the Vercel/serverless
  // function trace; the normal build stays dynamic and never enables export.
  outputFileTracingIncludes: {
    "/api/readiness": [
      "./migrations/*.up.sql",
      "./migrations/*.down.sql",
      "./data/examples/real-pilot/candidates/*.json",
    ],
    "/api/buyer-journeys": ["./data/examples/real-pilot/candidates/*.json"],
    "/api/expert-requests": ["./data/examples/real-pilot/candidates/*.json"],
    "/property/*": ["./data/examples/real-pilot/candidates/*.json"],
  },
};

export default nextConfig;
