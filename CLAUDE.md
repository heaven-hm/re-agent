<!-- openqodex:start -->

## Review with OpenQodex before you push

- Before any `git push`, run `npx -y openqodex@0.12.0 review` from the repository root. It takes one to three minutes: allow it up to ten minutes, or run it in the background and wait for it to exit.
- Show the developer the receipt it prints: the verdict, one line per finding and the absolute path of `report.html`. Ask: "Fix all, or tell me which?" Fix only the findings they name (`npx -y openqodex@0.12.0 findings 1,3` prints them in full), then review again and show the new receipt. OpenQodex starts its own reviewer process: the agent that wrote the code does not judge its own work.
- Do not push on a blocked verdict unless the developer says so after seeing the findings.
- The report is in `.openqodex/reviews/`.

<!-- openqodex:end -->
