import { createNotification } from './app.js';
import { Vue } from './vue.js';

class Component {
    constructor(name) {
        if (this.constructor === Component)
            throw new TypeError('Can not construct abstract class.');

        this.name = name;
        this.data = {};
    }

    worker() { }
}

class Control {

    constructor(key) {
        if (this.constructor === Control)
            throw new TypeError('Can not construct abstract class');
        if (!key)
            throw new Error('The key parameter is missing in super() of Control ');

        this.key = key;
        this.data = {};
        this.parent = null;
    }

    getNode() {
        if (this.parent === null)
            throw new Error("Control isn't added to Node/Input");

        return this.parent instanceof Node ? this.parent : this.parent.node;
    }

    getData(key) {
        return this.getNode().data[key];
    }

    putData(key, data) {
        this.getNode().data[key] = data;
    }
}

class Connection {

    constructor(output, input) {
        this.output = output;
        this.input = input;
        this.data = {};

        this.input.addConnection(this);
    }

    remove() {
        this.input.removeConnection(this);
        this.output.removeConnection(this);
    }
}

class IO {

    constructor(key, name, socket, multiConns) {
        this.node = null;
        this.multipleConnections = multiConns;
        this.connections = [];

        this.key = key;
        this.name = name;
        this.socket = socket;
    }

    removeConnection(connection) {
        this.connections.splice(this.connections.indexOf(connection), 1);
    }

    removeConnections() {
        this.connections.map(connection => this.removeConnection(connection));
    }
}

class Socket {

    constructor(name, data = {}) {
        this.name = name;
        this.data = data;
        this.compatible = [];
    }

    combineWith(socketName) {
        this.compatible.push(socketName);
    }

    compatibleWith(socket) {
        return this.name == socket.name || socket.compatible.includes(this.name);
    }
}

class Input extends IO {

    constructor(key, title, socket, multiConns = false) {
        super(key, title, socket, multiConns);
        this.control = null;
    }

    hasConnection() {
        return this.connections.length > 0;
    }

    addConnection(connection) {
        if (!this.multipleConnections && this.hasConnection())
            throw new Error('Multiple connections not allowed');
        this.connections.push(connection);
    }

    addControl(control) {
        this.control = control;
        control.parent = this;
    }

    showControl() {
        return !this.hasConnection() && this.control !== null;
    }
}

class Output extends IO {

    constructor(key, title, socket, multiConns = true) {
        super(key, title, socket, multiConns);
    }

    hasConnection() {
        return this.connections.length > 0;
    }

    connectTo(input) {
        if (!this.socket.compatibleWith(input.socket))
            throw new Error('Sockets not compatible');
        if (!input.multipleConnections && input.hasConnection())
            throw new Error('Input already has one connection');
        if (!this.multipleConnections && this.hasConnection())
            throw new Error('Output already has one connection');

        var connection = new Connection(this, input);

        this.connections.push(connection);
        return connection;
    }

    connectedTo(input) {
        return this.connections.some((item) => {
            return item.input === input;
        });
    }
}

class Node {

    constructor(name) {
        this.name = name;
        this.id = Node.incrementId();
        this.position = [0.0, 0.0];

        this.inputs = new Map();
        this.outputs = new Map();
        this.controls = new Map();
        this.data = {};
        this.meta = {};
    }

    addControl(control) {
        control.parent = this;

        this.controls.set(control.key, control);
        return this;
    }

    removeControl(control) {
        control.parent = null;

        this.controls.delete(control.key);
    }

    addInput(input) {
        if (input.node !== null)
            throw new Error('Input has already been added to the node');

        input.node = this;

        this.inputs.set(input.key, input);
        return this;
    }

    removeInput(input) {
        input.removeConnections();
        input.node = null;

        this.inputs.delete(input.key);
    }

    addOutput(output) {
        if (output.node !== null)
            throw new Error('Output has already been added to the node');

        output.node = this;

        this.outputs.set(output.key, output);
        return this;
    }

    removeOutput(output) {
        output.removeConnections();
        output.node = null;

        this.outputs.delete(output.key);
    }

    getConnections() {
        const ios = [...this.inputs.values(), ...this.outputs.values()];
        const connections = ios.reduce((arr, io) => {
            return [...arr, ...io.connections];
        }, []);

        return connections;
    }

    update() { }

    static incrementId() {
        if (!this.latestId)
            this.latestId = 1;
        else
            this.latestId++;
        return this.latestId
    }
}

class Component$1 extends Component {
    constructor(name) {
        super(name);
        if (this.constructor === Component$1)
            throw new TypeError('Can not construct abstract class.');

        this.editor = null;
        this.data = {};
    }

    async builder() { }

    async build(node) {
        await this.builder(node);

        return node;
    }

    async createNode(data = {}) {
        const node = new Node(this.name);

        node.data = data;
        await this.build(node);

        return node;
    }
}

class Events {

    constructor(handlers) {
        this.handlers = {
            warn: [console.warn],
            error: [console.error],
            ...handlers
        };
    }
}

class Emitter {

    constructor(events) {
        this.events = events instanceof Emitter ? events.events : events.handlers;
        this.silent = false;
    }

    on(names, handler) {
        names.split(' ').forEach(name => {
            if (!this.events[name])
                throw new Error(`The event ${name} does not exist`);
            this.events[name].push(handler);
        });

        return this;
    }

    trigger(name, params) {
        if (!(name in this.events))
            throw new Error(`The event ${name} cannot be triggered`);

        return this.events[name].reduce((r, e) => {
            return (e(params) !== false) && r
        }, true); // return false if at least one event is false        
    }

    bind(name) {
        if (this.events[name])
            throw new Error(`The event ${name} is already bound`);

        this.events[name] = [];
    }

    exist(name) {
        return Array.isArray(this.events[name]);
    }
}

class Context extends Emitter {

    constructor(id, events) {
        super(events);

        if (!/^[\w-]{3,}@[0-9]+\.[0-9]+\.[0-9]+$/.test(id))
            throw new Error('ID should be valid to name@0.1.0 format');

        this.id = id;
        this.plugins = new Map();
    }

    use(plugin, options = {}) {
        if (plugin.name && this.plugins.has(plugin.name)) throw new Error(`Plugin ${plugin.name} already in use`)

        plugin.install(this, options);
        this.plugins.set(plugin.name, options);
    }
}

class EditorEvents extends Events {

    constructor() {
        super({
            nodecreate: [],
            nodecreated: [],
            noderemove: [],
            noderemoved: [],
            connectioncreate: [],
            connectioncreated: [],
            connectionremove: [],
            connectionremoved: [],
            translatenode: [],
            nodetranslate: [],
            nodetranslated: [],
            nodedraged: [],
            selectnode: [],
            nodeselect: [],
            nodeselected: [],
            rendernode: [],
            rendersocket: [],
            rendercontrol: [],
            renderconnection: [],
            updateconnection: [],
            componentregister: [],
            keydown: [],
            keyup: [],
            translate: [],
            translated: [],
            zoom: [],
            zoomed: [],
            click: [],
            mousemove: [],
            contextmenu: [],
            import: [],
            export: [],
            process: []
        });
    }
}

class Drag {

    constructor(el, onTranslate = () => { }, onStart = () => { }, onDrag = () => { }) {
        this.mouseStart = null;

        this.el = el;
        this.onTranslate = onTranslate;
        this.onStart = onStart;
        this.onDrag = onDrag;

        el.addEventListener('mousedown', this.down.bind(this));
        el.addEventListener('touchstart', this.down.bind(this));

        this.boundMove = this.move.bind(this);
        this.boundUp = this.up.bind(this);
        window.addEventListener('mousemove', this.boundMove);
        window.addEventListener('mouseup', this.boundUp);
        window.addEventListener('touchmove', this.boundMove, { passive: false });
        window.addEventListener('touchend', this.boundUp);
    }

    dispose() {
        window.removeEventListener('mousemove', this.boundMove);
        window.removeEventListener('mouseup', this.boundUp);
        window.removeEventListener('touchmove', this.boundMove, { passive: false });
        window.removeEventListener('touchend', this.boundUp);
    }

    getCoords(e) {
        const props = e.touches ? e.touches[0] : e;

        return [props.pageX, props.pageY];
    }

    down(e) {
        e.stopPropagation();
        this.mouseStart = this.getCoords(e);

        this.onStart(e);
    }

    move(e) {
        if (!this.mouseStart) return;
        e.preventDefault();
        e.stopPropagation();

        let [x, y] = this.getCoords(e);
        let delta = [x - this.mouseStart[0], y - this.mouseStart[1]];
        let zoom = this.el.getBoundingClientRect().width / this.el.offsetWidth;

        this.onTranslate(delta[0] / zoom, delta[1] / zoom, e);
    }

    up(e) {
        if (!this.mouseStart) return;

        this.mouseStart = null;
        this.onDrag(e);
    }
}

class Zoom {

    constructor(container, el, intensity, onzoom) {
        this.el = el;
        this.intensity = intensity;
        this.onzoom = onzoom;

        this.distance = null;

        container.addEventListener('wheel', this.wheel.bind(this));
        container.addEventListener('touchmove', this.move.bind(this));
        container.addEventListener('touchend', this.end.bind(this));
        container.addEventListener('touchcancel', this.end.bind(this));
        container.addEventListener('dblclick', this.dblclick.bind(this));
    }

    wheel(e) {
        e.preventDefault();

        var rect = this.el.getBoundingClientRect();
        var delta = (e.wheelDelta ? e.wheelDelta / 120 : - e.deltaY / 3) * this.intensity;

        var ox = (rect.left - e.clientX) * delta;
        var oy = (rect.top - e.clientY) * delta;

        this.onzoom(delta, ox, oy, 'wheel');
    }

    touches(e) {
        let [x1, y1] = [e.touches[0].clientX, e.touches[0].clientY];
        let [x2, y2] = [e.touches[1].clientX, e.touches[1].clientY];
        let distance = Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));

        return {
            cx: (x1 + x2) / 2,
            cy: (y1 + y2) / 2,
            distance
        };
    }

    move(e) {
        if (e.touches.length < 2) return;

        let rect = this.el.getBoundingClientRect();
        let { cx, cy, distance } = this.touches(e);

        if (this.distance !== null) {
            let delta = distance / this.distance - 1;

            var ox = (rect.left - cx) * delta;
            var oy = (rect.top - cy) * delta;

            this.onzoom(delta, ox, oy, 'touch');
        }
        this.distance = distance;
    }

    end() {
        this.distance = null;
    }

    dblclick(e) {
        e.preventDefault();

        var rect = this.el.getBoundingClientRect();
        var delta = 4 * this.intensity;

        var ox = (rect.left - e.clientX) * delta;
        var oy = (rect.top - e.clientY) * delta;

        this.onzoom(delta, ox, oy, 'dblclick');
    }
}

class Area extends Emitter {

    constructor(container, emitter) {
        super(emitter);

        const el = this.el = document.createElement('div');

        this.container = container;
        this.transform = { k: 1, x: 0, y: 0 };
        this.mouse = { x: 0, y: 0 };

        el.style.transformOrigin = '0 0';

        this._startPosition = null;
        this._zoom = new Zoom(container, el, 0.1, this.onZoom.bind(this));
        this._drag = new Drag(container, this.onTranslate.bind(this), this.onStart.bind(this));
        this.container.addEventListener('mousemove', this.mousemove.bind(this));

        this.update();
    }

    dispose() {
        this._drag.dispose();
    }

    update() {
        const t = this.transform;

        this.el.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    }

    mousemove(e) {
        const rect = this.el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const k = this.transform.k;

        this.mouse = { x: x / k, y: y / k };
        this.trigger('mousemove', { ...this.mouse });
    }

    onStart() {
        this._startPosition = { ...this.transform };
    }

    onTranslate(dx, dy) {
        this.translate(this._startPosition.x + dx, this._startPosition.y + dy);
    }

    onZoom(delta, ox, oy, source) {
        this.zoom(this.transform.k * (1 + delta), ox, oy, source);

        this.update();
    }

    translate(x, y) {
        const params = { transform: this.transform, x, y };

        if (!this.trigger('translate', params)) return;

        this.transform.x = params.x;
        this.transform.y = params.y;

        this.update();
        this.trigger('translated');
    }

    zoom(zoom, ox = 0, oy = 0, source) {
        const k = this.transform.k;
        const params = { transform: this.transform, zoom, source };

        if (!this.trigger('zoom', params)) return;

        const d = (k - params.zoom) / ((k - zoom) || 1);

        this.transform.k = params.zoom || 1;
        this.transform.x += ox * d;
        this.transform.y += oy * d;

        this.update();
        this.trigger('zoomed', { source });
    }

    appendChild(el) {
        this.el.appendChild(el);
    }

    removeChild(el) {
        this.el.removeChild(el);
    }
}

class Control$1 extends Emitter {

    constructor(el, control, emitter) {
        super(emitter);
        this.trigger('rendercontrol', { el, control });
    }
}

class Socket$1 extends Emitter {

    constructor(el, type, io, node, emitter) {
        super(emitter);
        this.el = el;
        this.type = type;
        this.io = io;
        this.node = node;

        this.trigger('rendersocket', { el, [type]: this.io, socket: io.socket });
    }

    getPosition({ position }) {
        const el = this.el;

        return [
            position[0] + el.offsetLeft + el.offsetWidth / 2,
            position[1] + el.offsetTop + el.offsetHeight / 2
        ]
    }
}

class Node$1 extends Emitter {

    constructor(node, component, emitter) {
        super(emitter);

        this.node = node;
        this.component = component;
        this.sockets = new Map();
        this.controls = new Map();
        this.el = document.createElement('div');
        this.el.style.position = 'absolute';

        this.el.addEventListener('contextmenu', e => this.trigger('contextmenu', { e, node: this.node }));

        this._startPosition = null;
        this._drag = new Drag(this.el, this.onTranslate.bind(this), this.onSelect.bind(this), () => {
            this.trigger('nodedraged', node);
        });

        this.trigger('rendernode', {
            el: this.el,
            node,
            component: component.data,
            bindSocket: this.bindSocket.bind(this),
            bindControl: this.bindControl.bind(this)
        });

        this.update();
    }

    dispose() {
        this._drag.dispose();
    }

    bindSocket(el, type, io) {
        this.sockets.set(io, new Socket$1(el, type, io, this.node, this));
    }

    bindControl(el, control) {
        this.controls.set(control, new Control$1(el, control, this));
    }

    getSocketPosition(io) {
        return this.sockets.get(io).getPosition(this.node);
    }

    onSelect(e) {
        this.onStart();
        this.trigger('selectnode', { node: this.node, accumulate: e.ctrlKey });
    }

    onStart() {
        this._startPosition = [...this.node.position];
    }

    onTranslate(dx, dy) {
        this.trigger('translatenode', { node: this.node, dx, dy });
    }

    onDrag(dx, dy) {
        const x = this._startPosition[0] + dx;
        const y = this._startPosition[1] + dy;

        this.translate(x, y);
    }

    translate(x, y) {
        const node = this.node;
        const params = { node, x, y };

        if (!this.trigger('nodetranslate', params)) return;

        const prev = [...node.position];

        node.position[0] = params.x;
        node.position[1] = params.y;

        this.update();
        this.trigger('nodetranslated', { node, prev });
    }

    update() {
        this.el.style.transform = `translate(${this.node.position[0]}px, ${this.node.position[1]}px)`;
    }

    remove() {

    }
}

class Connection$1 extends Emitter {

    constructor(connection, inputNode, outputNode, emitter) {
        super(emitter);
        this.connection = connection;
        this.inputNode = inputNode;
        this.outputNode = outputNode;

        this.el = document.createElement('div');
        this.el.style.position = 'absolute';
        this.el.style.zIndex = '-1';

        this.trigger('renderconnection', {
            el: this.el,
            connection: this.connection,
            points: this.getPoints()
        });
    }

    getPoints() {
        const [x1, y1] = this.outputNode.getSocketPosition(this.connection.output);
        const [x2, y2] = this.inputNode.getSocketPosition(this.connection.input);

        return [x1, y1, x2, y2];
    }

    update() {
        this.trigger('updateconnection', {
            el: this.el,
            connection: this.connection,
            points: this.getPoints()
        });
    }
}

class EditorView extends Emitter {

    constructor(container, components, emitter) {
        super(emitter);

        this.container = container;
        this.components = components;

        this.nodes = new Map();
        this.connections = new Map();

        this.container.addEventListener('click', this.click.bind(this));
        this.container.addEventListener('contextmenu', e => this.trigger('contextmenu', { e, view: this }));
        this.boundResize = this.resize.bind(this);
        window.addEventListener('resize', this.boundResize);

        this.on('nodetranslated', this.updateConnections.bind(this));

        this.area = new Area(container, this);
        this.container.appendChild(this.area.el);
    }

    dispose() {
        this.nodes.forEach(e => e.dispose());
        this.area.dispose();
        window.removeEventListener('resize', this.boundResize);
    }

    addNode(node) {
        const nodeView = new Node$1(node, this.components.get(node.name), this);

        this.nodes.set(node, nodeView);
        this.area.appendChild(nodeView.el);
    }

    removeNode(node) {
        const nodeView = this.nodes.get(node);

        nodeView.dispose();
        this.nodes.delete(node);
        this.area.removeChild(nodeView.el);
    }

    addConnection(connection) {
        const viewInput = this.nodes.get(connection.input.node);
        const viewOutput = this.nodes.get(connection.output.node);
        const connView = new Connection$1(connection, viewInput, viewOutput, this);

        this.connections.set(connection, connView);
        this.area.appendChild(connView.el);
    }

    removeConnection(connection) {
        const connView = this.connections.get(connection);

        this.connections.delete(connection);
        this.area.removeChild(connView.el);
    }

    updateConnections({ node }) {
        node.getConnections().map(conn => {
            this.connections.get(conn).update();
        });
    }

    resize() {
        const { container } = this;
        const width = container.parentElement.clientWidth;
        const height = container.parentElement.clientHeight;

        this.area.el.style.width = width + 'px';
        this.area.el.style.height = height + 'px';
    }

    click(e) {
        const container = this.container;

        if (container !== e.target) return;
        if (!this.trigger('click', { e, container })) return;
    }
}

class Selected {

    constructor() {
        this.list = [];
    }

    add(item, accumulate = false) {
        if (!accumulate)
            this.list = [item];
        else if (!this.contains(item))
            this.list.push(item);
    }

    clear() {
        this.list = [];
    }

    remove(item) {
        this.list.splice(this.list.indexOf(item), 1);
    }

    contains(item) {
        return this.list.indexOf(item) !== -1;
    }

    each(callback) {
        this.list.forEach(callback);
    }
}

class NodeEditor extends Context {

    constructor(id, container) {
        super(id, new EditorEvents());

        this.nodes = [];
        this.components = new Map();

        this.selected = new Selected();
        this.view = new EditorView(container, this.components, this);

        this.boundTriggerKeydown = e => this.trigger('keydown', e);
        this.boundTriggerKeyup = e => this.trigger('keyup', e);
        window.addEventListener('keydown', this.boundTriggerKeydown);
        window.addEventListener('keyup', this.boundTriggerKeyup);
        this.on('selectnode', ({ node, accumulate }) => this.selectNode(node, accumulate));
        this.on('nodeselected', () => this.selected.each(n => this.view.nodes.get(n).onStart()));
        this.on('translatenode', ({ dx, dy }) => this.selected.each(n => this.view.nodes.get(n).onDrag(dx, dy)));
    }

    dispose() {
        this.view.dispose();
        window.removeEventListener('keydown', this.boundTriggerKeydown);
        window.removeEventListener('keyup', this.boundTriggerKeyup);
    }

    addNode(node) {
        if (!this.trigger('nodecreate', node)) return;

        this.nodes.push(node);
        this.view.addNode(node);

        this.trigger('nodecreated', node);
    }

    removeNode(node) {
        if (!this.trigger('noderemove', node)) return;

        node.getConnections().forEach(c => this.removeConnection(c));

        this.nodes.splice(this.nodes.indexOf(node), 1);
        this.view.removeNode(node);

        this.trigger('noderemoved', node);
    }

    connect(output, input, data = {}) {
        if (!this.trigger('connectioncreate', { output, input })) return;

        try {
            const connection = output.connectTo(input);

            connection.data = data;
            this.view.addConnection(connection);

            this.trigger('connectioncreated', connection);
        } catch (e) {
            this.trigger('warn', e);
        }
    }

    removeConnection(connection) {
        if (!this.trigger('connectionremove', connection)) return;

        this.view.removeConnection(connection);
        connection.remove();

        this.trigger('connectionremoved', connection);
    }

    selectNode(node, accumulate = false) {
        if (this.nodes.indexOf(node) === -1)
            throw new Error('Node not exist in list');

        if (!this.trigger('nodeselect', node)) return;

        this.selected.add(node, accumulate);

        this.trigger('nodeselected', node);
    }

    getComponent(name) {
        const component = this.components.get(name);

        if (!component)
            throw `Component ${name} not found`;

        return component;
    }

    register(component) {
        component.editor = this;
        this.components.set(component.name, component);
        this.trigger('componentregister', component);
    }

    clear() {
        [...this.nodes].map(node => this.removeNode(node));
    }

    beforeImport(data) {
        this.silent = true;
        this.clear();
        this.trigger('import', data);
    }

    afterImport() {
        this.silent = false;
    }
}

var index = {
    Component: Component$1,
    Control,
    NodeEditor,
    Emitter,
    Input,
    Node,
    Output,
    Socket
};

var mixin = {
    props: ['node', 'editor', 'bindSocket', 'bindControl'],
    methods: {
        inputs() {
            return Array.from(this.node.inputs.values())
        },
        outputs() {
            return Array.from(this.node.outputs.values())
        },
        controls() {
            return Array.from(this.node.controls.values())
        },
        selected() {
            return this.editor.selected.contains(this.node) ? 'selected' : '';
        },
        remove() {
            this.node.remove();
        }
    },
    directives: {
        socket: {
            bind(el, binding, vnode) {
                vnode.context.bindSocket(el, binding.arg, binding.value);
            }
        },
        control: {
            bind(el, binding, vnode) {
                if (!binding.value) return;

                vnode.context.bindControl(el, binding.value);
            }
        }
    }
};

var Socket$2 = {
    template: `<div :class="classes" :title="title"></div>`,
    props: ['type', 'socket'],
    computed: {
        classes: function () {
            const str = ["socket", this.type, this.socket.name];
            const replace = s => s.toLowerCase().replace(/ /g, '-');
            return Array.isArray(str) ? str.map(replace) : replace(str);
        },
        title: function () {
            return this.socket.name + '\n' + this.socket.data.hint;
        }
    }
};

const replace = s => s.toLowerCase().replace(/ /g, '-');

var Node$2 = {
    template: '#rulenode',
    mixins: [mixin],
    components: {
        Socket: Socket$2
    },
    computed: {
        classes: function () {
            return [replace(this.selected()), this.node.data.type];
        },
        title: function () {
            return this.node.name + '\n' + this.node.data.hint;
        }
    }
};

function createVue(el, vueComponent, vueProps) {
    const app = new Vue({
        render: h => h(vueComponent, { props: vueProps })
    });

    const nodeEl = document.createElement('div');

    el.appendChild(nodeEl);
    app.$mount(nodeEl);

    return app;
}

function createNode(editor, { el, node, component, bindSocket, bindControl }) {
    const vueComponent = component.component || Node$2;
    const vueProps = { ...component.props, node, editor, bindSocket, bindControl };
    const app = createVue(el, vueComponent, vueProps);

    node.vueContext = app.$children[0];
    if (node.mounted) node.mounted();
    return app;
}

function createControl(editor, { el, control }) {
    const vueComponent = control.component;
    const vueProps = { ...control.props, getData: control.getData.bind(control), putData: control.putData.bind(control) };
    const app = createVue(el, vueComponent, vueProps);
    control.vueContext = app.$children[0];
    if (control.mounted) control.mounted();
    return app;
}

const update = (entity) => {
    if (entity.vueContext)
        entity.vueContext.$forceUpdate();
};

function install(editor, params) {
    editor.on('rendernode', ({ el, node, component, bindSocket, bindControl }) => {
        node._vue = createNode(editor, { el, node, component, bindSocket, bindControl });
        node.update = () => update(node);
    });

    editor.on('rendercontrol', ({ el, control }) => {
        control._vue = createControl(editor, { el, control });
        control.update = () => update(control);
    });

    editor.on('connectioncreated connectionremoved', connection => {
        update(connection.output.node);
        update(connection.input.node);
    });

    editor.on('nodeselected', () => {
        editor.nodes.map(update);
    });
}

var VueRenderPlugin = {
    name: 'vue-render',
    install,
    mixin,
    Node: Node$2,
    Socket: Socket$2
};

class Background {
    constructor(editor) {
        const el = document.createElement('div');
        el.appendChild(document.createTextNode(' '));
        el.classList += `rete-background default`;
        editor.view.area.appendChild(el);
    }
}

class Restrictor {
    constructor(editor, scaleExtent, translateExtent) {
        this.editor = editor;
        this.scaleExtent = scaleExtent;
        this.translateExtent = translateExtent;

        if (scaleExtent)
            editor.on('zoom', this.restrictZoom.bind(this));
        if (translateExtent)
            editor.on('translate', this.restrictTranslate.bind(this));
    }

    restrictZoom(data) {
        const se = typeof this.scaleExtent === 'boolean' ? { min: 0.1, max: 1 } : this.scaleExtent;
        const tr = data.transform;

        if (data.zoom < se.min)
            data.zoom = se.min;
        else if (data.zoom > se.max)
            data.zoom = se.max;
    }

    restrictTranslate(data) {
        const te = typeof this.translateExtent === 'boolean' ? { width: 5000, height: 4000 } : this.translateExtent;
        const { container } = this.editor.view;
        const k = data.transform.k;
        const [kw, kh] = [te.width * k, te.height * k];
        const cx = container.clientWidth / 2;
        const cy = container.clientHeight / 2;

        data.x -= cx;
        data.y -= cy;
        
        if (data.x > kw)
            data.x = kw;
        else if (data.x < - kw)
            data.x = - kw;
        
        if (data.y > kh)
            data.y = kh;
        else if (data.y < - kh)
            data.y = - kh;
        
        data.x += cx;
        data.y += cy;
    }
}

class SnapGrid {
    constructor(editor, { size = 16, dynamic = true }) {
        this.editor = editor;
        this.size = size;

        if (dynamic)
            this.editor.on('nodetranslate', this.onTranslate.bind(this));
        else
            this.editor.on('rendernode', ({ node, el }) => {
                el.addEventListener('mouseup', this.onDrag.bind(this, node));
                el.addEventListener('touchend', this.onDrag.bind(this, node));
                el.addEventListener('touchcancel', this.onDrag.bind(this, node));
            });
    }

    onTranslate(data) {
        const { x, y } = data;

        data.x = this.snap(x);
        data.y = this.snap(y);
    }

    onDrag(node) {
        const [ x, y ] = node.position;

        node.position[0] = this.snap(x);
        node.position[1] = this.snap(y);
        console.log(this, x, y, node.position);
        
        this.editor.view.nodes.get(node).update();
        this.editor.view.updateConnections({ node });
    }
    
    snap(value) {
        return Math.round(value/this.size) * this.size;
    }
}

const min = (arr) => arr.length === 0 ? 0 : Math.min(...arr);
const max = (arr) => arr.length === 0 ? 0 : Math.max(...arr);

function nodesBBox(editor, nodes) {
    const left = min(nodes.map(node => node.position[0]));
    const top = min(nodes.map(node => node.position[1]));
    const right = max(nodes.map(node => node.position[0] + editor.view.nodes.get(node).el.clientWidth));
    const bottom = max(nodes.map(node => node.position[1] + editor.view.nodes.get(node).el.clientHeight));
    
    return {
        left,
        right,
        top,
        bottom,
        width: Math.abs(left - right),
        height: Math.abs(top - bottom),
        getCenter: () => {
            return [
                (left + right) / 2,
                (top + bottom) / 2
            ];
        }
    };
}

function zoomAt(editor, nodes = editor.nodes) {
    const bbox = nodesBBox(editor, nodes);
    const [x, y] = bbox.getCenter();
    const [w, h] = [editor.view.container.clientWidth, editor.view.container.clientHeight];
    const { area } = editor.view;

    var [kw, kh] = [w / bbox.width, h / bbox.height];
    var k = Math.min(kh * 0.9, kw * 0.9, 1);

    area.transform.x = area.container.clientWidth / 2 - x * k;
    area.transform.y = area.container.clientHeight / 2 - y * k;
    area.zoom(k, 0, 0);
    
    area.update();
}

function install$1(editor, params) {
    let background = params.background || false;
    let snap = params.snap || false;
    let scaleExtent = params.scaleExtent || false;
    let translateExtent = params.translateExtent || false;

    if (background) {
        this._background = new Background(editor, background);
    }
    if (scaleExtent || translateExtent) {
        this._restrictor = new Restrictor(editor, scaleExtent, translateExtent);
    }
    if (snap) {
        this._snap = new SnapGrid(editor, snap);
    }
}    

var ReteArea = {
    install: install$1,
    zoomAt
};

function toTrainCase(str) {
    return str.toLowerCase().replace(/ /g, '-');
}

function defaultPath(points, curvature) {
    const [x1, y1, x2, y2] = points;
    const hx1 = x1 + Math.abs(x2 - x1) * curvature;
    const hx2 = x2 - Math.abs(x2 - x1) * curvature;

    return `M ${x1} ${y1} C ${hx1} ${y1} ${hx2} ${y2} ${x2} ${y2}`;
}

function renderPathData(emitter, points, connection) {
    const data = { points, connection, d: '' };
    
    emitter.trigger('connectionpath', data);
    
    return data.d || defaultPath(points, 0.4);
}

function updateConnection({ el, d }) {
    const path = el.querySelector('.connection path');

    if (!path) throw new Error('Path of connection was broken');

    path.setAttribute('d', d);
}

function renderConnection({ el, d, connection }) {
    const classed = !connection?[]:[
        'input-' + toTrainCase(connection.input.name),
        'output-' + toTrainCase(connection.output.name),
        'socket-input-' + toTrainCase(connection.input.socket.name),
        'socket-output-' + toTrainCase(connection.output.socket.name)
    ];

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    svg.classList.add('connection', ...classed);
    path.classList.add('main-path');
    path.setAttribute('d', d);

    svg.appendChild(path);
    el.appendChild(svg);

    updateConnection({ el, d });
}

class Picker {

    constructor(editor) {
        this.el = document.createElement('div');
        this.editor = editor;
        this._output = null;
    }

    get output() {
        return this._output;
    }

    set output(val) {
        const { area } = this.editor.view;

        this._output = val;
        if (val !== null) {
            area.appendChild(this.el);
            this.renderConnection();
        } else if (this.el.parentElement) {
            area.removeChild(this.el);
            this.el.innerHTML = '';
        }
    }

    getPoints() {
        const mouse = this.editor.view.area.mouse;
        const node = this.editor.view.nodes.get(this.output.node);
        const [x1, y1] = node.getSocketPosition(this.output);

        return [x1, y1, mouse.x, mouse.y];
    }

    updateConnection() {
        if (!this.output) return;

        const d = renderPathData(this.editor, this.getPoints());

        updateConnection({ el: this.el, d });
    }

    renderConnection() {
        if (!this.output) return;

        const d = renderPathData(this.editor, this.getPoints());

        renderConnection({ el: this.el, d, connection: null });
    }

}

function install$2(editor) {
    editor.bind('connectionpath');
    
    var picker = new Picker(editor);

    function pickOutput(output) {
        if (output && !picker.output) {
            picker.output = output;
            return;
        }
    }

    function pickInput(input) {
        if (picker.output === null) {
            if (input.hasConnection()) {
                picker.output = input.connections[0].output;
                editor.removeConnection(input.connections[0]);
            }
            return true;
        }

        if (!input.multipleConnections && input.hasConnection())
            editor.removeConnection(input.connections[0]);
        
        if (!picker.output.multipleConnections && picker.output.hasConnection())
            editor.removeConnection(picker.output.connections[0]);
        
        if (picker.output.connectedTo(input)) {
            var connection = input.connections.find(c => c.output === picker.output);

            editor.removeConnection(connection);
        }

        editor.connect(picker.output, input);
        picker.output = null;
    }

    function pickConnection(connection) {
        const { output } = connection;

        editor.removeConnection(connection);
        picker.output = output;
    }

    editor.on('rendersocket', ({ el, input, output }) => {

        var prevent = false;

        function mouseHandle(e) {
            if (prevent) return;
            e.stopPropagation();
            e.preventDefault();
            
            if (input)
                pickInput(input);
            else if (output)
                pickOutput(output);
        }

        el.addEventListener('mousedown', e => (mouseHandle(e), prevent = true));
        el.addEventListener('mouseup', mouseHandle);
        el.addEventListener('click', e => (mouseHandle(e), prevent = false));
        el.addEventListener('mousemove', () => (prevent = false));
    });

    editor.on('mousemove', () => { picker.updateConnection(); });

    editor.view.container.addEventListener('mousedown', () => { 
        picker.output = null;
    });

    editor.on('renderconnection', ({ el, connection, points }) => {
        const d = renderPathData(editor, points, connection);

        el.addEventListener('contextmenu', e => {
            e.stopPropagation();
            e.preventDefault();
            
            pickConnection(connection);
        });

        renderConnection({ el, d, connection });
    });

    editor.on('updateconnection', ({ el, connection, points }) => {
        const d = renderPathData(editor, points, connection);

        updateConnection({ el, connection, d });
    });
}

var ConnectionPlugin = {
    install: install$2,
    defaultPath
};

class TextControl extends index.Control {
  constructor(emitter, key, label, description, msg) {
    super(key);
    this.render = 'vue';
    this.emitter = emitter;
    this.component = { // Vue component
      data: function () { return { value: '', label: label, description: description } },
      props: ['change'],
      template: '<label :title="description">{{label}}: <input :value="value" @input="change($event)"/></label>'
    };
    this.props = { change: this.change.bind(this) };
    this.msg = msg;
  }

  change(e) {
    this.setValue(e.target.value);
  }

  mounted() {
    this.setValue(this.msg);
  }

  setValue(val) {
    if (!this.vueContext) {
      this.msg = val;
      return;
    }
    this.vueContext.value = val;
  }
}

class OHRuleComponent extends index.Component {
  constructor(moduletype) {
    super(moduletype.uid);
    this.moduletype = moduletype;
  }

  remove(node) {
    this.editor.removeNode(node);
  }
  builder(node) {
    node.remove = () => this.remove(node);
    node.id = index.Node.latestId + 1;
    index.Node.latestId = Math.max(node.id, index.Node.latestId);
    node.data = { type: this.moduletype.type, label: this.moduletype.label, description: this.moduletype.description };
    if (this.moduletype.inputs)
      for (const input of this.moduletype.inputs) {
        if (!input.type) return;
        const socket = new index.Socket(input.type, { hint: input.description });
        socket.combineWith("java.lang.Object");
        if (input.type = "org.openhab.core.types.Command") {
          socket.combineWith("org.openhab.core.types.State");
        }
        else if (input.type = "org.openhab.core.types.State") {
          socket.combineWith("org.openhab.core.types.Command");
        }
        else if (input.type = "org.eclipse.smarthome.core.types.Command") {
          socket.combineWith("org.eclipse.smarthome.core.types.State");
        }
        else if (input.type = "org.eclipse.smarthome.core.types.State") {
          socket.combineWith("org.eclipse.smarthome.core.types.Command");
        }
        node.addInput(new index.Input(input.name, input.label, socket));
      }
    if (this.moduletype.outputs)
      for (const output of this.moduletype.outputs) {
        if (!output.type) return;
        const socket = new index.Socket(output.type, { hint: output.description });
        socket.combineWith("java.lang.Object");
        node.addOutput(new index.Output(output.name, output.label, socket));
      }
    if (this.moduletype.configDescriptions)
      for (const configDesc of this.moduletype.configDescriptions) {
        if (!configDesc.type) return;
        const label = configDesc.label ? configDesc.label : configDesc.name;
        let control = new TextControl(this.editor, configDesc.name, label,
          configDesc.description, "test");
        node.addControl(control);
      }
  }
}

class ImportExport {
  static async addNode(nodeEditor, entry, x, y) {
    const node = new index.Node(entry.type);
    node.position = [x, y];
    var component = nodeEditor.getComponent(entry.type);
    if (!component) {
      console.warn("Did not find component", entry);
      return;
    }
    const c = await component.build(node);
    node.id = entry.id;
    node.data.label = entry.label;
    node.data.description = entry.description;
    if (entry.configuration) {
      Object.keys(entry.configuration).forEach(controlKey => {
        let control = node.controls.get(controlKey);
        if (control) {
          const value = entry.configuration[controlKey];
          control.setValue(value);
        }
      });
    }

    nodeEditor.addNode(c);
    return node;
  }
  static async fromJSON(nodeEditor, rule) {
    nodeEditor.beforeImport(rule);
    var nodes = {};

    var x = 0;
    var y = 0;
    try {
      y = 32;
      x = 32;
      if (rule.triggers && rule.triggers.length > 0)
        for (const entry of rule.triggers) {
          nodes[entry.id] = await ImportExport.addNode(nodeEditor, entry, x, y);
          y += 32 * 4;
        }
      y = 32;
      if (rule.conditions && rule.conditions.length > 0) {
        x += 32 * 9;
        for (const entry of rule.conditions) {
          nodes[entry.id] = await ImportExport.addNode(nodeEditor, entry, x, y);
          y += 32 * 4;
        }
      }
      y = 32;
      if (rule.actions && rule.actions.length > 0) {
        x += 32 * 10;
        for (const entry of rule.actions) {
          nodes[entry.id] = await ImportExport.addNode(nodeEditor, entry, x, y);
          y += 32 * 4;
        }
      }

      // Socket connections
      Object.keys(nodes).forEach(id => {
        var cnode = nodes[id];
        if (!cnode.inputs) return;
        const inputs = Object.keys(cnode.inputs);
        Object.keys(inputs).forEach(inputid => {
          const temp = inputs[inputid].split("\.");
          const nodeid = temp[0];
          const outputid = temp[1];
          const targetNode = node[nodeid];
          const output = targetNode.outputs.get(outputid);
          const input = cnode.inputs.get(inputid);
          nodeEditor.connect(output, input, data);
        });
      });
    }
    catch (e) {
      nodeEditor.trigger('warn', e);
      nodeEditor.afterImport();
      return false;
    }
    nodeEditor.afterImport();
    return true;
  }

  static toJSON(nodeEditor) {
    const data = { id: nodeEditor.id, nodes: {} };

    nodeEditor.nodes.forEach(node => data.nodes[node.id] = {
      'id': node.id,
      'data': node.data,
      'inputs': Array.from(node.inputs).reduce((obj, [key, input]) => (obj[key] = {
        'connections': input.connections.map(c => {
          return {
            node: c.output.node.id,
            output: c.output.key,
            data: c.data
          };
        })
      }, obj), {}),
      'outputs': Array.from(node.outputs).reduce((obj, [key, output]) => (obj[key] = {
        'connections': output.connections.map(c => {
          return {
            node: c.input.node.id,
            input: c.input.key,
            data: c.data
          }
        })
      }, obj), {}),
      'position': node.position,
      'name': node.name
    });
    nodeEditor.trigger('export', data);
    return data;
  }
}

/**
 * @category Web Components
 * @customelement oh-rule-editor
 * @description A rule editor component
 * @example <caption>An example</caption>
 * <oh-rule-editor></oh-rule-editor>
 */
class OhRuleEditor extends HTMLElement {
  constructor() {
    super();
    this._moduletypes = [];
  }
  set moduletypes(val) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      delete this.debounceTimer;
      this._moduletypes = val;
      if (this.editor) this.buildComponents(this.editor);
    }, 50);
  }
  set rule(val) {
    this._rule = val;
  }
  buildComponents(editor) {
    this.componentsBuild = true;
    for (const moduletype of this._moduletypes) {
      editor.register(new OHRuleComponent(moduletype));
    }
    if (this._rule) {
      ImportExport.fromJSON(editor, this._rule).then(() => {
        editor.view.resize();
      });
    }
  }
  connectedCallback() {
    var editor = new index.NodeEditor('tasksample@0.1.0', this);
    editor.use(ConnectionPlugin, { curvature: 0.4 });
    editor.use(VueRenderPlugin);
    editor.use(ReteArea, { scaleExtent: true, snap: true, translateExtent: true, background: true });

    console.log("starting rule editor", this._moduletypes);

    editor.on('connectioncreate connectionremove nodecreate noderemove', () => {
      if (editor.silent) return;
    });

    this.editor = editor;
    if (!this.componentsBuild) this.buildComponents(this.editor);
    this.boundDragover = e => this.dragover(e);
    this.boundDrop = e => this.drop(e);
    this.addEventListener("dragover", this.boundDragover, true);
    this.addEventListener("drop", this.boundDrop, true);
  }
  disconnectedCallback() {
    this.removeEventListener("dragover", this.boundDragover, true);
    this.removeEventListener("drop", this.boundDrop, true);
    if (!this.editor) return;
    this.editor.dispose();
    delete this.editor;
  }
  dragover(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }
  async drop(event) {
    event.preventDefault();
    var data = event.dataTransfer.getData("oh/rulecomponent");
    if (!data) return;
    var component = this.editor.getComponent(data);
    if (!component) {
      createNotification(null, `Component ${data} not known`, false, 1500);
      return;
    }

    const node = new index.Node(data);
    node.position = [event.offsetX, event.offsetY];
    const c = await component.build(node);
    this.editor.addNode(c);
  }
}

customElements.define('oh-rule-editor', OhRuleEditor);

/**
 * Rule module
 * 
 * This module is used on the Rule editing page and embeds Rete.js for rendering.
 * 
 * @category Web Components
 * @module rule
 */
