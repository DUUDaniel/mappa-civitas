# Mappa Civitas

A civic sports map for choosing one court that works for a group. The live page is [duudaniel.github.io/mappa-civitas](https://duudaniel.github.io/mappa-civitas/). This file only describes the steps. It does not change the page.

Amap covers mainland China best. Place names can be English or Chinese.

## Steps

1. Open the page and wait until the map finishes loading.
2. Set your start. Tap **My location** and allow the browser prompt, or type a place and press **Use this location** if the pin is wrong. Automatic location can be blocked; typing still works.
3. Choose a sport: basketball, tennis, table tennis, badminton, golf, bowling, football, or go-karting.
4. Add each partner before searching. Enter a name and a place, with the city if you know it, such as `Guomao, Beijing` or `国贸 北京`. The matched district is shown under the name so you can check it. A colored pin appears on the map as soon as the place is found.
5. Press **Find courts by car**. The search does not start until the partners are in.
6. Open a court. Car routes are drawn first. Then try **Light rail**, **Public**, **Walk**, or **Cycle**. Each person gets a time and a distance. A short description of the court is under the name.

## How a court is chosen

The center is the Cartesian midpoint of you and every partner. Longitude and latitude are converted to a local east-north plane, with longitude scaled by \(\cos(\text{latitude})\), and then averaged.

The outer circle stops at \(1.2\) times the distance from that center to the farthest person. If everyone is on the same pin, the radius is 3 km so a court can still be found.

Inside that circle, courts are packed more tightly near the center and thin out in a straight line toward the edge. The disk is split into five rings. The list fills up to 20 courts, and stops early only if Amap has fewer than that inside the circle.

Those courts are then ordered by total driving time. If Amap does not return a driving route, the missing time is estimated from distance.

## What the map draws after the search

- A red diamond labeled **Center** at the midpoint.
- A red **x** axis (east-west) and **y** axis (north-south) through that point.
- Five circles. **Level 1** is the smallest. **Level 5** is the outer edge. Each label includes the radius, such as `Level 5 · 1.7 km`.
- Colored pins for you and each partner, and a marker for each court.

**Hide the labels** removes the words, including Center, the axis letters, the level labels, and the names. The axes and circles stay. **Show the labels** brings the words back.

## Files

The published page is the `gh-pages` branch: `index.html`, `amap.js`, and `planner.js`. The Amap security code is not stored in this repository.
