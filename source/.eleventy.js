import Image from "@11ty/eleventy-img";
import path from "path";
import fs from "fs";

async function imageShortcode(src, alt, options = {}) {
  const imgSrc = path.join("src", "assets", src);

  const metadata = await Image(imgSrc, {
    widths: [480, 960, 1440, 1920],
    formats: ["avif", "webp", "jpeg"],
    outputDir: "./_site/img/",
    urlPath: "/img/",
  });

  const isHero = options.hero === true;
  const imageAttributes = {
    alt,
    sizes: "(max-width: 480px) 480px, (max-width: 960px) 960px, (max-width: 1440px) 1440px, 1920px",
    loading: isHero ? "eager" : "lazy",
    decoding: isHero ? "sync" : "async",
    ...(isHero ? { fetchpriority: "high" } : {}),
  };

  return Image.generateHTML(metadata, imageAttributes);
}

export default function (eleventyConfig) {
  // 12 MB source image guard — runs before every build
  eleventyConfig.on("eleventy.before", async () => {
    const assetsDir = "src/assets";
    if (!fs.existsSync(assetsDir)) return;
    const files = fs.readdirSync(assetsDir);
    for (const file of files) {
      const filePath = path.join(assetsDir, file);
      const stat = fs.statSync(filePath);
      const mb = stat.size / (1024 * 1024);
      if (mb > 12) {
        throw new Error(
          `Source image "${file}" is ${mb.toFixed(1)} MB — exceeds 12 MB limit. Resize before committing (see CONTRIBUTING.md).`
        );
      }
    }
  });

  eleventyConfig.addNunjucksAsyncShortcode("image", imageShortcode);
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");

  return {
    dir: {
      input: "src",
      output: "_site",
    },
  };
}
