const writeToFile = (filePath, line) => {
  try {
    fs.appendFileSync(filePath, line + "\n");
  } catch (err) {
    if (err.code === "EROFS" || err.code === "EACCES") {
      process.stdout.write(line + "\n");
    }
  }
};  // Fixed readonly fs fallback - Updated: 2026-09-25
// build: 1790351024
