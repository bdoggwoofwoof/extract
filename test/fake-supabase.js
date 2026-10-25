// Stand-in for supabase-js used only by tests (served by dev-server.js with FAKE_SB=1).
// Implements just the calls sync.js makes, backed by the dev server's in-memory store.
var supabase = (function () {
  function createClient() {
    var KEY = "fake-session", listeners = [];
    var getS = function () { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
    var post = function (path, body) {
      var s = getS();
      return fetch("/__fake/" + path, { method: "POST", headers: { "content-type": "application/json", "x-uid": s ? s.user.id : "" }, body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json(); });
    };
    var auth = {
      getSession: function () { return Promise.resolve({ data: { session: getS() } }); },
      onAuthStateChange: function (f) { listeners.push(f); return { data: { subscription: { unsubscribe: function () {} } } }; },
      signInWithOtp: function () { return Promise.resolve({ error: null }); },
      verifyOtp: function (o) {
        if (o.token !== "123456") return Promise.resolve({ error: { message: "bad code" } });
        var s = { user: { id: "u-" + o.email.replace(/\W/g, ""), email: o.email } };
        localStorage.setItem(KEY, JSON.stringify(s)); listeners.forEach(function (f) { f("SIGNED_IN", s); });
        return Promise.resolve({ error: null });
      },
      signOut: function () { localStorage.removeItem(KEY); listeners.forEach(function (f) { f("SIGNED_OUT", null); }); return Promise.resolve({}); }
    };
    function from(table) {
      var q = { gt: "" };
      var b = {
        select: function () { return b; }, order: function () { return b; }, limit: function () { return b; },
        gt: function (_c, v) { q.gt = v; return b; },
        insert: function (row) { return post("insert/" + table, row).then(function (j) { return { error: j.error || null }; }); },
        then: function (res, rej) { return post("select/" + table, q).then(function (j) { return { data: j.data, error: j.error || null }; }).then(res, rej); }
      };
      return b;
    }
    return {
      auth: auth, from: from,
      rpc: function (name, args) { return post("rpc/" + name, args).then(function (j) { return { data: j.data, error: j.error || null }; }); },
      channel: function () { var c = { on: function () { return c; }, subscribe: function () { return c; } }; return c; },
      removeChannel: function () {}
    };
  }
  return { createClient: createClient };
})();
