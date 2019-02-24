import Vue from 'vue/dist/vue.esm.js';
import VueInProgress from '../_vuecomponents/vue-inprogress';

Vue.config.ignoredElements = [
  /^oh-/, /^ui-/
]

/**
 * A vue rendered component.
 * 
 * This component renders nothing until start() is called.
 */
class OhVue extends HTMLElement {
  constructor() {
    super();
    this.ok = false;
    this.vue = {};
  }
  connectedCallback() {
    const forid = this.getAttribute("for");
    var tmpEl = document.getElementById(forid);
    if (!tmpEl) {
      tmpEl = this.nextElementSibling;
    }
    if (!tmpEl) {
      this.innerHTML = "<div>Template required</div>";
      return;
    }

    this.tmpl = tmpEl;
    this.ok = true;
    this.dispatchEvent(new Event("load"));
  }
  disconnectedCallback() {
    if (this.vue && this.vue.destroyed) this.vue.destroyed();
  }
  start(mixins, context) {
    if (!this.ok) return;

    this.vue = new Vue({
      data: function () {
        return {
          context: context
        }
      },
      mixins: [...mixins],
      template: this.tmpl,
      components: { 'vue-inprogress': VueInProgress },
    }).$mount(this.appendChild(document.createElement("div")));
  }
  updateContext(context) {
    this.vue.context = context;
  }
}

customElements.define('oh-vue', OhVue);