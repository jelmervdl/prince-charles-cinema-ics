import { Browser } from "happy-dom";
import ical from "ical-generator";
import fs from "node:fs";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].reduce((acc, month, index) => ({ ...acc, [month]: index }), {});

function parseDate(day, time) {
  const [dow, dom, mon] = day.split(" ");
  const [_, h, m, am] = time.match(/^(\d{1,2}):(\d{2}) (am|pm)$/);
  const today = new Date();
  const date = parseInt(dom);
  const monthIdx = months[mon];
  const year = today.getFullYear() + ((monthIdx < today.getMonth() || (monthIdx === today.getMonth() && date < today.getDate())) ? 1 : 0);
  const hour = parseInt(h) + (am === "pm" ? 12 : 0);
  const minute = parseInt(m);
  // console.log({ today, day, time, date, monthIdx, year, hour, minute });
  const value = new Date(
    year,
    monthIdx,
    date,
    hour,
    minute
  );
  if (isNaN(value.valueOf()))
    throw new Error(`Invalid date: ${day} ${time}`);
  return value;
}

function scrape(page, callback) {
  page.querySelectorAll(".jacrofilm-list .jacro-event").forEach(eventEl => {
    const title = eventEl.querySelector(".liveeventtitle").textContent.trim();
    const filmUrl = eventEl.querySelector(".film_img > a[href]")?.href;
    const description = eventEl.querySelector(".jacrofilm-list-content > .jacro-formatted-text")?.innerText;
    const runtime = Array.from(
      eventEl.querySelectorAll(".running-time > span"),
      span => {
        return span.textContent.trim()
      }).find(text => {
        const match = text.match(/^(\d+)\s*mins$/);
        if (match)
          return match[1];
      })

    let day = null;
    eventEl.querySelectorAll(".performance-list-items > *").forEach(listEl => {
      if (listEl.matches(".heading")) {
        day = listEl.textContent.trim();
      } else if (listEl.matches("li")) {
        console.assert(day !== null);
        const buttonEl = listEl.querySelector(".film_book_button, .soldfilm_book_button");
        if (!buttonEl) return;
        const time = buttonEl.querySelector(".time").textContent.trim();
        const url = buttonEl.href;
        try {
          const start = parseDate(day, time);
          const end = new Date(start.getTime() + (parseInt(runtime) || 0) * 60_000);
          const soldOut = listEl.matches(".soldfilm_book_button");
          callback({ title, start, end, url, description, soldOut, filmUrl });
        } catch(err) {
          console.error("Error while processing", { title, filmUrl, description, runtime, day, time}, err);
        }
      }
    })
  })
}

async function main() {
  const calendar = ical({
    name: "Prince Charles Cinema"
  });
  const browser = new Browser({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableComputedStyleRendering: true,
      navigation: {
        disableChildPageNavigation: true,
        disableChildFrameNavigation: true,
      }
    }
  });

  const page = browser.newPage();
  await page.goto("https://princecharlescinema.com/whats-on/");
  await page.waitUntilComplete();

  scrape(page.mainFrame.document, ({title, start, end, url, description, filmUrl, soldOut}) => {
    calendar.createEvent({
      start,
      end,
      url,
      summary: title,
      description: `${soldOut ? "[sold out] " : ""}${filmUrl}\n\n${description}`,
    })
  });

  const dest = process.argv[2] || "out.ics";
  fs.writeFile(dest, calendar.toString(), error => {
    if (error) {
      console.error(error);
    } else {
      console.log(`wrote ${calendar.events().length} events to ${dest}`);
    }
  })

  await browser.close();
}

main();
