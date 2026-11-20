import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/digital-map-labels.js', import.meta.url), 'utf8');

function element() {
  const classes = new Set();
  return {
    style: {},
    offsetWidth: 100,
    offsetHeight: 24,
    classList: {
      add(name) { classes.add(name); },
      contains(name) { return classes.has(name); },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };
}

function setup() {
  const frames = new Map();
  const listeners = new Map();
  const panes = new Map();
  const groups = [];
  let frameId = 0;
  const map = {
    zoom: 9,
    scale: 1,
    host: { isConnected: true, clientWidth: 800, clientHeight: 600 },
    getPane(name) { return panes.get(name); },
    createPane(name) {
      const pane = element();
      panes.set(name, pane);
      return pane;
    },
    getContainer() { return this.host; },
    getZoom() { return this.zoom; },
    getSize() { return { x: 800, y: 600 }; },
    latLngToContainerPoint([lat, lng]) { return { x: lng * this.scale, y: lat }; },
    on(names, listener) {
      for (const name of names.split(' ')) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(listener);
      }
    },
    off(names, listener) {
      for (const name of names.split(' ')) listeners.get(name)?.delete(listener);
    },
    fire(name) {
      for (const listener of listeners.get(name) || []) listener();
    }
  };
  const root = {
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    MapLabelPosition: { getLabelPoint(feature) { return feature.point; } },
    L: {
      divIcon(options) { return options; },
      marker(position, options) { return { position, options }; },
      layerGroup() {
        const group = {
          markers: [],
          removed: false,
          addTo() { return this; },
          addLayer(marker) { this.markers.push(marker); },
          remove() { this.removed = true; }
        };
        groups.push(group);
        return group;
      }
    }
  };
  vm.runInNewContext(source, { window: root, document: { createElement: element } });
  const features = [
    { properties: { code: 'a', name: 'Phường An Lộc' }, point: [100, 100] },
    { properties: { code: 'b', name: 'Phường Biên Hòa' }, point: [100, 150] },
    { properties: { code: 'c', name: '<img src=x onerror=alert(1)>' }, point: [300, 100] }
  ];
  return {
    api: root.DigitalMapLabels,
    map,
    groups,
    frames,
    listeners,
    boundaries: { features },
    labels() { return groups[0].markers.map(marker => marker.options.icon.html); },
    flush() {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback();
    }
  };
}

test('ward labels use text and do not intercept map or keyboard interaction', () => {
  const fixture = setup();
  fixture.api.mount(fixture.map, fixture.boundaries);
  fixture.flush();
  const labels = fixture.labels();
  assert.equal(labels[0].textContent, 'Phường An Lộc');
  assert.equal(labels[2].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(labels[2].innerHTML, undefined);
  assert.equal(fixture.map.getPane('digitalWardNames').style.pointerEvents, 'none');
  for (const marker of fixture.groups[0].markers) {
    assert.equal(marker.options.interactive, false);
    assert.equal(marker.options.keyboard, false);
    assert.equal(marker.options.pane, 'digitalWardNames');
  }
});

test('colliding names are hidden, selected ward wins, and zoom reveals spaced names', () => {
  const fixture = setup();
  fixture.api.mount(fixture.map, fixture.boundaries);
  fixture.flush();
  const [first, second, third] = fixture.labels();
  assert.equal(first.style.visibility, 'visible');
  assert.equal(second.style.visibility, 'hidden');
  assert.equal(third.style.visibility, 'visible');
  fixture.api.select(fixture.map, 'b');
  fixture.flush();
  assert.equal(first.style.visibility, 'hidden');
  assert.equal(second.style.visibility, 'visible');
  assert.equal(second.classList.contains('is-selected'), true);
  fixture.map.zoom = 12;
  fixture.map.scale = 3;
  fixture.map.fire('zoomend');
  fixture.flush();
  assert.equal(first.style.visibility, 'visible');
  assert.equal(second.style.visibility, 'visible');
  assert.equal(fixture.map.getPane('digitalWardNames').classList.contains('is-overview'), false);
});

test('mount is idempotent and resize events are coalesced into one animation frame', () => {
  const fixture = setup();
  const controller = fixture.api.mount(fixture.map, fixture.boundaries);
  assert.equal(fixture.api.mount(fixture.map, fixture.boundaries), controller);
  for (let count = 0; count < 24; count += 1) fixture.map.fire('resize');
  assert.equal(fixture.frames.size, 1);
  assert.equal(fixture.groups.length, 1);
  fixture.flush();
  assert.equal(fixture.frames.size, 0);
});

test('hidden map waits for resize and unload removes layers, listeners and queued work', () => {
  const fixture = setup();
  fixture.map.host.clientHeight = 0;
  fixture.api.mount(fixture.map, fixture.boundaries);
  fixture.flush();
  assert.equal(fixture.labels()[0].style.visibility, 'hidden');
  fixture.map.host.clientHeight = 600;
  fixture.map.fire('resize');
  fixture.flush();
  assert.equal(fixture.labels()[0].style.visibility, 'visible');
  fixture.map.fire('moveend');
  assert.equal(fixture.frames.size, 1);
  fixture.map.fire('unload');
  assert.equal(fixture.frames.size, 0);
  assert.equal(fixture.groups[0].removed, true);
  for (const callbacks of fixture.listeners.values()) assert.equal(callbacks.size, 0);
  fixture.api.mount(fixture.map, fixture.boundaries);
  assert.equal(fixture.groups.length, 2);
});

test('missing geometry and empty ward names do not produce labels', () => {
  const fixture = setup();
  fixture.boundaries.features.push({ properties: { name: 'Invalid' }, point: null });
  fixture.boundaries.features.push({ properties: { name: '' }, point: [100, 100] });
  fixture.api.mount(fixture.map, fixture.boundaries);
  assert.equal(fixture.groups[0].markers.length, 3);
  assert.equal(fixture.api.mount(null, fixture.boundaries), null);
});
