export default function () {
  return process.env.ELEVENTY_ENV || process.env.NODE_ENV || "production";
}
