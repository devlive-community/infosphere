"use strict";var Popover=(function(){var a=$('[data-toggle="popover"]');function b(d){var e="";if(d.data("color")){e=" popover-"+d.data("color")}var c={trigger:"focus",template:'<div class="popover'+e+'" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div><div class="popover-navigation"><button class="btn btn-primary" data-role="prev">« Prev</button><button class="btn btn-primary" data-role="next">Next »</button><button class="btn btn-primary" data-role="end">End tour</button></div></div>'};d.popover(c);d.popover("show")}if(a.length){a.each(function(){b($(this))})}})();