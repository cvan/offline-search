function deepCopy(o) {
  var copy = o, k;
  if (o && typeof o === 'object') {
    copy = Object.prototype.toString.call(o) === '[object Array]' ? [] : {};
    for (k in o) {
      copy[k] = deepCopy(o[k]);
    }
  }
  return copy;
}

function log() {
  // Wrapper around `console.log` so we can `postMessage` log statements
  // so they show up in the console of the main window (for Firefox).
  var msg = Array.prototype.slice.call(arguments, 0).join(' ');
  postMessage({type: 'log', data: msg});
}

var index;

function index(data) {
  // TODO: Have uglify inline these scripts when minfied.
  importScripts('lunr.js');
  importScripts('lunr.unicodeNormalizer.js');

  log('Loaded lunr v' + lunr.version);

  log('GET', data.url);

  // Define fields to index in lunr.
  index = lunr(function () {
    var that = this;
    Object.keys(data.fields).forEach(function (k) {
      that.field(k, data.fields[k]);
    });
    that.ref(data.ref || '_id');
  });

  // Fetch JSON of all the documents.
  var xhr = new XMLHttpRequest();
  xhr.onload = loadDocs;
  xhr.open('get', data.url, true);
  xhr.send();
}

var docsObj = {};
var docsList = [];

function loadDocs() {
  var list = JSON.parse(this.responseText);

  var _id;
  var doc = {};

  list.forEach(function indexDoc(rawDoc) {
    if (Object.keys(rawDoc).length) {
      _id = rawDoc[index._ref].toString();
      if (_id in docsObj) {
        // Bail out if we've already indexed this doc.
        return;
      }
      docsObj[_id] = rawDoc;
      docsList.push(rawDoc);

      doc = deepCopy(rawDoc);

      // Look at each item in the object, and convert any arrays to
      // strings or any objects to strings so we can index them.
      // Any objects with keys are assumed to be localised fields.
      Object.keys(doc).forEach(function (key) {
        if (Array.isArray(doc[key])) {
          doc[key] = doc[key].join(', ');
        } else if (typeof doc[key] === 'object') {
          if (navigator.language in doc[key]) {
            doc[key] = doc[key][navigator.language];
          } else if ('en-US' in doc[key]) {
            doc[key] = doc[key]['en-US'];
          }
        }
      });

      index.add(doc);
    }
  });

  log('Indexed ' + list.length +
      ' doc' + (list.length === 1 ? '' : 's'));

  postMessage({type: 'indexed', data: {object: docsObj, array: docsList}});
}

function searchDocs(data) {
  var results;
  var timeStart = data.timeStart;
  var query = data.query;
  log('Searching lunr for "' + query + '"');

  // TODO: Return only an array of objects of {id: _idx, score: score}.

  if (query) {
    // Return document for each match.
    results = index.search(query).map(function (v) {
      return {
        doc: docsObj[v.ref],
        score: v.score
      };
    });
  } else {
    // Return all documents if no query was provided.
    results = docsList.map(function (v) {
      return {
        doc: v
      };
    });
  }

  postMessage({
    type: 'results',
    data: {
      query: query,
      results: results,
      timeStart: timeStart
    }
  });
}

var methods = {
  index: index,
  search: searchDocs
};

addEventListener('message', function (e) {
  var method = methods[e.data.type];
  if (method) {
    method(e.data.data);
  }
}, false);
