/**
 * Mock HTML responses for Untappd scraper unit tests
 */

// Example HTML structure from Untappd search results
export const VALID_BEER_ITEM_HTML = `
<div class="beer-item">
  <div class="top">
    <a class="label" href="/b/guinness-guinness-draught/4234">
      <img src="https://untappd.akamaized.net/site/beer_logos..." alt="Guinness Draught" />
    </a>
    <div class="beer-details">
      <p class="name">
        <a href="/b/guinness-guinness-draught/4234">Guinness Draught</a>
      </p>
      <p class="brewery">
        <a href="/Guinness">Guinness</a>
      </p>
      <p class="style">Stout - Irish Dry</p>
      <p class="abv">4.2% ABV</p>
    </div>
    <div class="details">
      <span class="caps" data-rating="3.73"></span>
      <span class="num">3.73</span>
      <p class="raters">1,234,567 Ratings</p>
    </div>
  </div>
  <div class="beer-description">
    <p>A smooth, dark Irish stout with hints of coffee and chocolate.</p>
  </div>
</div>
`;

export const MULTIPLE_BEER_ITEMS_HTML = `
<div class="beer-item">
  <div class="beer-details">
    <p class="name"><a href="/b/beer1">Heineken Lager</a></p>
    <p class="brewery"><a href="/Heineken">Heineken</a></p>
    <p class="style">Lager - Euro</p>
    <p class="abv">5.0% ABV</p>
  </div>
  <div class="details">
    <span class="caps" data-rating="2.85"></span>
    <p class="raters">500,000 Ratings</p>
  </div>
</div>
<div class="beer-item">
  <div class="beer-details">
    <p class="name"><a href="/b/beer2">Heineken 0.0</a></p>
    <p class="brewery"><a href="/Heineken">Heineken</a></p>
    <p class="style">Non-Alcoholic Beer</p>
    <p class="abv">0.0% ABV</p>
  </div>
  <div class="details">
    <span class="caps" data-rating="2.50"></span>
  </div>
</div>
`;

export const NO_RESULTS_HTML = `
<div class="search-results">
  <div class="no-results">
    <p>No beers found matching your search.</p>
  </div>
</div>
`;

export const INCOMPLETE_BEER_HTML = `
<div class="beer-item">
  <div class="beer-details">
    <p class="name"><a href="/b/mystery">Unknown Beer</a></p>
  </div>
</div>
`;

export const RATING_PARENTHESES_FORMAT_HTML = `
<div class="beer-item">
  <div class="beer-details">
    <p class="name"><a href="/b/pliny">Pliny the Elder</a></p>
    <p class="brewery"><a href="/RussianRiver">Russian River Brewing Company</a></p>
    <p class="style">IPA - Imperial / Double</p>
    <p class="abv">8.0% ABV</p>
  </div>
  <div class="details">
    (4.228)
    <p class="raters">456,789 Ratings</p>
  </div>
</div>
`;

// Full page wrapper
export const wrapInPage = (beerItemsHtml: string): string => `
<!DOCTYPE html>
<html>
<head><title>Untappd Search</title></head>
<body>
  <div class="content">
    <div class="search-results">
      ${beerItemsHtml}
    </div>
  </div>
</body>
</html>
`;
