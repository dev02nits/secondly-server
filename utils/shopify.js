import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const { STOREDOMAIN: storeDomain, ACCESSTOKEN: adminAccessToken } = process.env;

export const shopifyApiUrl = (endpoint) =>
  `https://${storeDomain}/admin/api/2024-04/${endpoint}`;

export const shopifyRequest = async (endpoint, method = "GET", body = null) => {
  const options = {
    method,
    headers: {
      "X-Shopify-Access-Token": adminAccessToken,
      "Content-Type": "application/json",
    },
    ...(body && { body: JSON.stringify(body) }),
  };

  const res = await fetch(shopifyApiUrl(endpoint), options);
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text };
};
