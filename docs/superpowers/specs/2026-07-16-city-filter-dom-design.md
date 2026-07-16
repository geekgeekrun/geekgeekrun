# City Filter DOM Design

## Goal

Ensure the BOSS recommendation-page city filter selects Shenzhen before auto-chat scanning can begin.

## Problem

The current implementation appends the configured city code to a `ka` selector. If that selector is absent, it silently continues and leaves the page's default city selected. The runtime can therefore report a configured Shenzhen code while the visible page remains on another city.

## Design

City selection will use the opened city picker and locate a visible option whose text is exactly the configured city name. It will click that option and then verify that the city filter trigger displays the same city name.

If the option cannot be found, the click fails, or the trigger does not display the selected city, the helper will throw `CITY_FILTER_NOT_APPLIED`. The worker will not continue scanning or start chats in that state.

Non-city filters retain their current code-based selection behavior. No BOSS chat action is part of this change.

## Tests

A Puppeteer DOM test will prove that the helper selects a visible Shenzhen option rather than an unrelated default city and rejects when the expected city is absent. The existing package test suite must remain green.
