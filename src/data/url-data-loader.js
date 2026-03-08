"use strict";

const DATA_CACHE = {};

function tryLoadData(data_url) {
  if (DATA_CACHE[data_url]) {
    return DATA_CACHE[data_url];
  }
  try {
    console.log(`loading data from ${data_url}...`);
    const url = new URL(data_url);
    const req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send(null);
    DATA_CACHE[url] = req.responseText
      .split(/\r?\n|\r/)
      .map((l) => l.split(",").map((s) => +s));
    console.log(`done loading data from ${data_url}`);
    return DATA_CACHE[url];
  } catch (e) {
    console.log(
      `error loading data from URL '${data_url}' message '${e.message}`,
    );
  }
}

export function tryURLInit(url) {
  const data = tryLoadData(url);
  if (data) {
    return (i, j, h, w) => {
      const row = data[i % data.length];
      return row[j % row.length];
    };
  }
}
