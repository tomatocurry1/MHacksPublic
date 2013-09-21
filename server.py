import flask
import werkzeug.serving
import werkzeug.debug
from socketio import socketio_manage
from socketio.namespace import BaseNamespace
from socketio.mixins import BroadcastMixin
from socketio.server import SocketIOServer
from gevent import monkey; monkey.patch_all()

app = flask.Flask(__name__, static_folder='static', static_url_path='')

class Gate(object):
    def __init__(self, id_, x, y):
        self.id = id_
        gates[id_] = self
        self.x = x
        self.y = y
        self.on = False

class AndGate(Gate):
    def __init__(self, id_, x, y):
        super(AndGate, self).__init__(id_, x, y)

    def run(self, inputs):
        return all(inputs)

AndGate.type = 'and'
AndGate.num_args = 2

gate_types = { AndGate.type : AndGate }

gates = {}
wires = {}

class WebsocketNamespace(BaseNamespace, BroadcastMixin):
    def initalize(self):
        print 'init'

    def on_join(self, _):
        self.emit('gate_status', { id_ : { 'type': v.type, 'num_args': v.num_args, 'x': v.x, 'y': v.y, 'state': v.on } for id_, v in gates.items() })
        self.emit('wire_status', wires)

    def on_create(self, d):
        id_ = int(d['id'])
        print 'create', id_
        if id_ not in gates:
            gates[id_] = gate_types[d['type']](id_, d['x'], d['y'])
            self.broadcast_event_not_me('create', { 'id': id_, 'type': d['type'], 'x': d['x'], 'y': d['y'] })

    def on_destroy(self, d):
        print 'destroy', d
        id_ = int(d['id'])
        if id_ in gates:
            del gates[id_]
            self.broadcast_event_not_me('destroy', { 'id': id_ })
            for start, end in reversed(wires.items()):
                if start == id_ or end == id_:
                    del wires[(start, end)]


    def on_wire_connect(self, d):
        print 'wc', d
        id1, id2 = int(d['id1']), int(d['id2'])
        if id1 in gates and id2 in gates and id1 not in wires:
            wires[id1] = id2
            self.broadcast_event_not_me('wire_connect', { 'id1': id1, 'id2': id2 })

    def on_move(self, d):
        id_ = int(d['id'])
        print 'move', d
        if id_ in gates:
            print 'moving'
            gates[id_].x = d['x']
            gates[id_].y = d['y']
            self.broadcast_event_not_me('move', { 'id': id_, 'x': int(d['x']), 'y': int(d['y']) })



class DebuggedApplicationFix(werkzeug.debug.DebuggedApplication): #the debugger doesn't work with ws: http://stackoverflow.com/a/18552263/1159735
    def __call__(self, environ, start_response):
        # check if websocket call
        if "wsgi.websocket" in environ and not environ["wsgi.websocket"] is None:
            # a websocket call, no debugger ;)
            return app(environ, start_response)
        # else go on with debugger
        return werkzeug.debug.DebuggedApplication.__call__(self, environ, start_response)

@app.route('/socket.io/<path:rest>', methods=['GET', 'POST'])
def push_stream(rest):
    try:
        socketio_manage(flask.request.environ, {'': WebsocketNamespace}, flask.request)
    except Exception as e:
        app.logger.error("Exception while handling socketio connection", exc_info=True)
    return flask.Response()

#@werkzeug.serving.run_with_reloader
def run_dev_server():
    global server
    app.debug = True
    port = 5000
    dapp = DebuggedApplicationFix(app, evalex = True)
    server = SocketIOServer(('', port), dapp, resource="socket.io")
    server.serve_forever()

if __name__ == '__main__':
    run_dev_server()