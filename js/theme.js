/**
 * Tema claro/oscuro. Guarda la preferencia en localStorage y avisa a los
 * demás módulos (render, decision-log, processor-view, app) con un evento
 * 'themechange' para que vuelvan a dibujar con la paleta correcta.
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  const Theme = g.Scheduler.Theme = g.Scheduler.Theme || {};
  const KEY = 'scheduler-theme';

  function get(){
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function set(theme){
    theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try{ localStorage.setItem(KEY, theme); }catch(e){}
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  function toggle(){ set(get() === 'dark' ? 'light' : 'dark'); }

  // El atributo ya lo puso el script inline en <head> (evita el parpadeo);
  // esto solo asegura que quede consistente si ese script no corrió.
  function init(){
    if(!document.documentElement.dataset.theme){
      let saved = 'light';
      try{ saved = localStorage.getItem(KEY) || 'light'; }catch(e){}
      document.documentElement.dataset.theme = saved;
    }
  }

  Theme.get = get;
  Theme.set = set;
  Theme.toggle = toggle;
  Theme.init = init;
})(globalThis);
