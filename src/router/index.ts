import { createRouter, createWebHashHistory } from "vue-router";
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/:catchAll(.*)",
      name: "404",
      meta: {
        title: "404",
      },
      component: () => import("@/pages/error/404.vue"),
    },
    {
      path: "/",
      redirect: "/workbench",
    },
    {
      path: "/workbench",
      component: () => import("@/pages/workbench/index.vue"),
      redirect: "/project",
      children: [
        {
          path: "/project",
          component: () => import("@/views/project/index.vue"),
        },
        {
          path: "/task",
          component: () => import("@/views/task/index.vue"),
        },
        // {
        //   path: "/detail",
        //   component: () => import("@/views/detail/index.vue"),
        // },
        {
          path: "/novel",
          component: () => import("@/views/novel/index.vue"),
        },
        {
          path: "/script",
          component: () => import("@/views/script/index.vue"),
        },
        {
          path: "/scriptAgent",
          component: () => import("@/views/scriptAgent/index.vue"),
        },
        // 塑角造景已并入资产列表（批量润色 / 生成 / AI 配音色都在那里），旧地址跳过去
        {
          path: "/cornerScape",
          redirect: "/assetBoard",
        },
        {
          path: "/assetBoard",
          component: () => import("@/views/assetBoard/index.vue"),
        },
        {
          path: "/production",
          component: () => import("@/views/production/index.vue"),
        },
        {
          path: "/assets",
          component: () => import("@/views/assets/index.vue"),
        },
        {
          path: "/canvas",
          component: () => import("@/views/canvas/index.vue"),
        },
        // 无限画布项目（projectType = canvas）的主页面：自由的文本 / 图片 / 音频 / 视频节点画布
        {
          path: "/freeCanvas",
          component: () => import("@/views/freeCanvas/index.vue"),
        },
        // 镜头台：逐镜出图 → 出视频（取代分镜节点里的 editImage 小画板）
        {
          path: "/shots",
          component: () => import("@/views/shots/index.vue"),
        },
        {
          path: "/test",
          component: () => import("@/views/test/index.vue"),
        },
      ],
    },
    // 剪辑台独立成页：从镜头台新开标签页进来，不套工作台外壳（它自己要整屏）
    {
      path: "/editor",
      component: () => import("@/views/editor/index.vue"),
    },
    {
      path: "/login",
      component: () => import("@/pages/login/index.vue"),
    },
  ],
});
router.beforeEach((to, from, next) => {
  if (to.path === "/login") {
    next();
  } else {
    if (localStorage.getItem("token")) {
      next();
    } else {
      next("/login");
    }
  }
});
export default router;
