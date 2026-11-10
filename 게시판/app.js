const basePosts = [
  {id:9,category:"공지",title:"2026년 하반기 주요 업무 추진계획 안내",excerpt:"하반기 중점 추진과제와 부서별 협조사항을 안내드립니다.",content:"2026년 하반기 주요 업무 추진계획을 다음과 같이 안내드립니다.\n\n각 부서에서는 추진 일정과 담당 업무를 확인하고, 세부 실행계획을 기한 내 제출해 주시기 바랍니다. 변경 사항이 발생할 경우 게시판을 통해 다시 안내드리겠습니다.",author:"기획운영팀",date:"2026-11-08",views:328,pinned:true},
  {id:8,category:"공지",title:"개인정보 보호 및 정보보안 수칙 재안내",excerpt:"업무 자료를 다룰 때 반드시 지켜야 할 보안 수칙을 확인해 주세요.",content:"업무 중 취급하는 개인정보와 내부 자료의 안전한 관리를 위해 정보보안 수칙을 다시 안내드립니다.\n\n1. 개인정보가 포함된 파일은 암호화하여 보관합니다.\n2. 승인되지 않은 외부 서비스에 업무 자료를 업로드하지 않습니다.\n3. 자리를 비울 때에는 반드시 화면을 잠급니다.",author:"정보보안팀",date:"2026-11-05",views:291,pinned:true,attachment:"개인정보보호_수칙.pdf"},
  {id:7,category:"일정",title:"11월 부서장 회의 개최 안내",excerpt:"11월 정례 부서장 회의 일정과 안건 제출 기한을 알려드립니다.",content:"11월 정례 부서장 회의를 개최합니다.\n\n일시: 2026년 11월 18일(수) 10:00\n장소: 본관 3층 대회의실\n\n보고 안건이 있는 부서는 11월 13일까지 회의자료를 제출해 주시기 바랍니다.",author:"운영지원팀",date:"2026-11-03",views:185},
  {id:6,category:"자료",title:"업무보고서 표준 서식 및 작성 예시",excerpt:"보고서 작성에 활용할 수 있는 최신 표준 서식을 공유합니다.",content:"업무보고서 표준 서식과 항목별 작성 예시를 공유합니다.\n\n첨부파일을 내려받아 사용하시고, 문서의 제목·작성일·담당부서 항목을 빠짐없이 기재해 주세요.",author:"기획운영팀",date:"2026-10-30",views:412,attachment:"업무보고서_표준서식.zip"},
  {id:5,category:"공지",title:"내부 시스템 정기 점검 안내",excerpt:"안정적인 서비스 제공을 위한 정기 점검이 진행됩니다.",content:"내부 시스템 정기 점검을 아래와 같이 실시합니다.\n\n점검 일시: 2026년 11월 14일 22:00 ~ 24:00\n\n점검 시간에는 게시판과 내부 업무 시스템 이용이 일시적으로 제한될 수 있습니다.",author:"정보화지원팀",date:"2026-10-28",views:143},
  {id:4,category:"일정",title:"신규 직원 대상 업무 교육 신청 안내",excerpt:"문서 작성과 내부 시스템 활용 교육 참가자를 모집합니다.",content:"신규 직원을 대상으로 기본 업무 교육을 진행합니다.\n\n교육일: 2026년 11월 25일\n신청기한: 2026년 11월 16일\n교육내용: 행정문서 작성, 내부 시스템 사용, 정보보안 기본수칙",author:"인재개발팀",date:"2026-10-24",views:226,attachment:"교육과정_안내.pdf"},
  {id:3,category:"자료",title:"2026년 조직 및 담당업무 현황",excerpt:"부서별 담당업무와 담당자 연락처 현황을 게시합니다.",content:"2026년 11월 기준 조직 및 담당업무 현황입니다.\n\n업무 협의와 자료 요청 시 첨부된 담당업무표를 참고해 주세요. 인사이동 등으로 내용이 변경되면 최신 자료로 교체됩니다.",author:"인사행정팀",date:"2026-10-20",views:367,attachment:"조직_담당업무_현황.xlsx"},
  {id:2,category:"자료",title:"자주 묻는 질문(FAQ) 모음",excerpt:"업무 시스템과 자료 제출에 관한 자주 묻는 질문을 정리했습니다.",content:"업무 중 자주 문의하는 내용을 분야별로 정리했습니다.\n\n게시된 답변으로 해결되지 않는 내용은 해당 업무 담당자에게 문의해 주세요.",author:"운영지원팀",date:"2026-10-15",views:534,attachment:"업무_FAQ.pdf"},
  {id:1,category:"일정",title:"연말 주요 자료 제출 일정",excerpt:"연말 결산과 실적 보고를 위한 자료 제출 일정을 안내합니다.",content:"연말 주요 자료 제출 일정을 안내드립니다.\n\n부서별 실적보고: 12월 4일\n예산 집행현황: 12월 11일\n최종 업무보고: 12월 18일\n\n원활한 취합을 위해 제출 기한을 준수해 주세요.",author:"기획운영팀",date:"2026-10-10",views:278}
];

const state = {posts:[],category:"전체",query:"",sort:"latest",page:1,perPage:6};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const categoryClass = {"공지":"notice","일정":"schedule","자료":"resource"};
const categoryName = {"공지":"공지사항","일정":"주요 일정","자료":"자료실"};

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>'"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

function loadPosts(){
  try{state.posts=[...JSON.parse(localStorage.getItem("newsroom-posts")||"[]"),...basePosts]}
  catch{state.posts=[...basePosts]}
}

function formatDate(value){
  return new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(`${value}T00:00:00`)).replace(/\. /g,".").replace(/\.$/,"");
}

function getFilteredPosts(){
  const query=state.query.trim().toLowerCase();
  const filtered=state.posts.filter((post)=>{
    const categoryMatch=state.category==="전체"||post.category===state.category;
    const text=[post.title,post.excerpt,post.content,post.author,categoryName[post.category]].join(" ").toLowerCase();
    return categoryMatch&&(!query||text.includes(query));
  });
  return filtered.sort((a,b)=>{
    if(a.pinned!==b.pinned)return a.pinned?-1:1;
    if(state.sort==="views")return b.views-a.views;
    if(state.sort==="oldest")return new Date(a.date)-new Date(b.date);
    return new Date(b.date)-new Date(a.date);
  });
}

function renderCounts(){
  $("#noticeCount").textContent=state.posts.filter((p)=>p.category==="공지").length;
  $("#scheduleCount").textContent=state.posts.filter((p)=>p.category==="일정").length;
  $("#resourceCount").textContent=state.posts.filter((p)=>p.category==="자료").length;
}

function renderPosts(){
  const posts=getFilteredPosts();
  const totalPages=Math.max(1,Math.ceil(posts.length/state.perPage));
  state.page=Math.min(state.page,totalPages);
  const start=(state.page-1)*state.perPage;
  const visible=posts.slice(start,start+state.perPage);
  $("#resultSummary").innerHTML=state.query?`‘${escapeHtml(state.query)}’ 검색 결과 <strong>${posts.length}</strong>건`:`전체 <strong>${posts.length}</strong>건`;
  $("#boardList").classList.toggle("hidden",!posts.length);
  $("#emptyState").classList.toggle("hidden",!!posts.length);
  $("#pagination").classList.toggle("hidden",!posts.length);
  $("#boardList").innerHTML=visible.map((post,index)=>{
    const number=posts.length-(start+index);
    const isNew=(new Date()-new Date(`${post.date}T00:00:00`))/86400000<=7;
    return `<article class="post-item" data-post-id="${post.id}" tabindex="0" role="button" aria-label="${escapeHtml(post.title)} 상세 보기">
      ${post.pinned?'<span class="post-index pinned">중요</span>':`<span class="post-index">${number}</span>`}
      <div class="post-main">
        <h3 class="post-title"><span class="post-label ${categoryClass[post.category]}">${categoryName[post.category]}</span>${escapeHtml(post.title)}${post.attachment?'<span class="attachment-mark" title="첨부파일 있음">▣</span>':''}${isNew?'<i class="new-badge" title="새 글"></i>':''}</h3>
        <p class="post-excerpt">${escapeHtml(post.excerpt||post.content)}</p>
      </div>
      <time class="post-date" datetime="${post.date}">${formatDate(post.date)}</time>
      <span class="post-views">${post.views.toLocaleString("ko-KR")}</span>
    </article>`;
  }).join("");
  renderPagination(totalPages);
  $$(".post-item").forEach((item)=>{
    item.addEventListener("click",()=>openPost(Number(item.dataset.postId)));
    item.addEventListener("keydown",(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openPost(Number(item.dataset.postId))}});
  });
}

function renderPagination(totalPages){
  const buttons=[];
  buttons.push(`<button type="button" data-page="${state.page-1}" ${state.page===1?"disabled":""} aria-label="이전 페이지">‹</button>`);
  for(let page=1;page<=totalPages;page++)buttons.push(`<button type="button" class="${page===state.page?"active":""}" data-page="${page}" aria-label="${page}페이지" ${page===state.page?'aria-current="page"':""}>${page}</button>`);
  buttons.push(`<button type="button" data-page="${state.page+1}" ${state.page===totalPages?"disabled":""} aria-label="다음 페이지">›</button>`);
  $("#pagination").innerHTML=buttons.join("");
  $$("#pagination button:not(:disabled)").forEach((button)=>button.addEventListener("click",()=>{state.page=Number(button.dataset.page);renderPosts();$("#board").scrollIntoView({behavior:"smooth"})}));
}

function setCategory(category){
  state.category=category;state.page=1;
  $$("#categoryTabs button").forEach((button)=>{const active=button.dataset.category===category;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active))});
  renderPosts();
}

function setSearch(value){
  state.query=value.trim();state.page=1;$("#searchInput").value=state.query;renderPosts();$("#board").scrollIntoView({behavior:"smooth"});
}

function openPost(id){
  const post=state.posts.find((item)=>item.id===id);if(!post)return;
  post.views+=1;
  $("#dialogCategory").textContent=categoryName[post.category];
  $("#dialogDate").textContent=formatDate(post.date);
  $("#dialogTitle").textContent=post.title;
  $("#dialogAuthor").textContent=`작성자  ${post.author}`;
  $("#dialogViews").textContent=`조회  ${post.views.toLocaleString("ko-KR")}`;
  $("#dialogContent").textContent=post.content;
  $("#dialogAttachment").classList.toggle("hidden",!post.attachment);
  $("#attachmentName").textContent=post.attachment||"";
  $("#postDialog").showModal();renderPosts();
}

function showToast(message){
  const toast=$("#toast");toast.textContent=message;toast.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove("show"),2200);
}

function submitPost(event){
  event.preventDefault();
  const data=new FormData(event.currentTarget);
  const now=new Date();
  const post={id:Date.now(),category:data.get("category"),title:data.get("title").trim(),excerpt:data.get("content").trim().replace(/\n/g," ").slice(0,75),content:data.get("content").trim(),author:data.get("author").trim(),attachment:data.get("attachment").trim(),date:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`,views:0,pinned:false};
  const custom=JSON.parse(localStorage.getItem("newsroom-posts")||"[]");custom.unshift(post);localStorage.setItem("newsroom-posts",JSON.stringify(custom));
  state.posts.unshift(post);event.currentTarget.reset();$("#writeDialog").close();state.category="전체";state.query="";state.sort="latest";state.page=1;$("#searchInput").value="";$("#sortSelect").value="latest";setCategory("전체");renderCounts();showToast("새 게시글이 등록되었습니다.");$("#board").scrollIntoView({behavior:"smooth"});
}

function init(){
  loadPosts();renderCounts();renderPosts();
  $("#searchForm").addEventListener("submit",(event)=>{event.preventDefault();setSearch($("#searchInput").value)});
  $$("[data-keyword]").forEach((button)=>button.addEventListener("click",()=>setSearch(button.dataset.keyword)));
  $$("#categoryTabs button").forEach((button)=>button.addEventListener("click",()=>setCategory(button.dataset.category)));
  $("#sortSelect").addEventListener("change",(event)=>{state.sort=event.target.value;state.page=1;renderPosts()});
  $("#clearSearchButton").addEventListener("click",()=>{state.query="";$("#searchInput").value="";setCategory("전체")});
  $("#openWriteButton").addEventListener("click",()=>$("#writeDialog").showModal());
  $$("[data-close-dialog]").forEach((button)=>button.addEventListener("click",()=>$("#postDialog").close()));
  $$("[data-close-write]").forEach((button)=>button.addEventListener("click",()=>$("#writeDialog").close()));
  $("#writeForm").addEventListener("submit",submitPost);
  $("#downloadAttachment").addEventListener("click",()=>showToast("예시 화면에서는 파일명이 표시됩니다."));
  [$("#postDialog"),$("#writeDialog")].forEach((dialog)=>dialog.addEventListener("click",(event)=>{if(event.target===dialog)dialog.close()}));
}

init();
