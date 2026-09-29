// Pulls journal posts from the repo's /journal folder — same idea as before,
// but now reading the plain Markdown files that Pages CMS writes (title,
// date, summary, video in frontmatter; the post text below it) instead of
// parsing meta tags out of full HTML pages.
//
// Nothing here needs updating when you add a post through Pages CMS —
// it just reads whatever's in /journal/ each time a page loads.

const JOURNAL_REPO = 'pobajobs-cmd/carb-calculator';
const JOURNAL_BRANCH = 'main';
const JOURNAL_FOLDER = 'journal';

// Splits a Markdown file into its frontmatter (the --- ... --- block at the
// top) and the body text below it. Handles the simple flat key: value
// frontmatter Pages CMS writes for our fields — nothing nested, so this
// stays a small hand-written parser rather than a full YAML library.
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const data = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) return;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[m[1]] = val;
  });
  return { data, body: match[2].trim() };
}

async function fetchRawFile(path) {
  const url = `https://raw.githubusercontent.com/${JOURNAL_REPO}/${JOURNAL_BRANCH}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load ' + path);
  return res.text();
}

async function fetchPosts() {
  const listUrl = `https://api.github.com/repos/${JOURNAL_REPO}/contents/${JOURNAL_FOLDER}?ref=${JOURNAL_BRANCH}`;

  let files = [];
  try {
    const res = await fetch(listUrl);
    if (res.ok) {
      const items = await res.json();
      files = Array.isArray(items) ? items.filter(i => i.type === 'file' && i.name.endsWith('.md')) : [];
    }
  } catch (e) {
    return [];
  }

  const posts = await Promise.all(files.map(async (file) => {
    try {
      const raw = await fetchRawFile(`${JOURNAL_FOLDER}/${file.name}`);
      const { data } = parseFrontmatter(raw);
      const slug = file.name.replace(/\.md$/, '');
      return {
        slug,
        date: data.date || slug,
        title: data.title || slug,
        summary: data.summary || '',
        video: data.video || '',
      };
    } catch (e) {
      return null;
    }
  }));

  return posts.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
}

async function fetchPost(slug) {
  const raw = await fetchRawFile(`${JOURNAL_FOLDER}/${slug}.md`);
  const { data, body } = parseFrontmatter(raw);
  return {
    slug,
    date: data.date || slug,
    title: data.title || slug,
    summary: data.summary || '',
    video: data.video || '',
    body,
  };
}

function fmtPostDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// Pulls the 11-character YouTube video ID out of any common link format
// (youtu.be/..., youtube.com/watch?v=..., youtube.com/embed/...).
function youTubeId(url) {
  if (!url) return '';
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : '';
}
