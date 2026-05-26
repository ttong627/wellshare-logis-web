#!/usr/bin/env python3
"""
wellshare-logis-web 전용 멀티에이전트 크루
사용법: python crew.py "구현할 기능 설명"
"""

import sys
import os
from dotenv import load_dotenv
from crewai import Agent, Task, Crew, Process
from crewai.llm import LLM

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    print("오류: agents/.env 파일에 ANTHROPIC_API_KEY를 설정하세요.")
    sys.exit(1)

# LLM 설정 (역할별 모델 분리)
opus   = LLM(model="claude-opus-4-7",    api_key=ANTHROPIC_API_KEY)
sonnet = LLM(model="claude-sonnet-4-6",  api_key=ANTHROPIC_API_KEY)

PROJECT_CONTEXT = """
프로젝트: wellshare-logis-web (물류/배송 관리 웹)
스택: React 19 + TypeScript + Vite + Firebase(Firestore/Auth/Storage) + Tailwind CSS v4
패턴: 컴포넌트 기반, Firestore 실시간 구독, Firebase Auth 인증, 글래스모피즘 UI
"""

# ── 에이전트 정의 ────────────────────────────────────────────────────────────

architect = Agent(
    role="수석 아키텍트 (Anthony)",
    goal="요구사항을 분석하고 최적의 구현 계획과 코드 초안을 설계한다",
    backstory=f"""
20년 경력의 풀스택 아키텍트. React/TypeScript/Firebase 전문가.
{PROJECT_CONTEXT}
비동기 처리, Firestore 최적화, 컴포넌트 재사용성을 최우선으로 고려한다.
항상 완전한 코드(생략 없이 100%)를 제공하며 단계별 구현 순서를 명확히 정리한다.
""",
    llm=opus,
    verbose=True,
)

reviewer = Agent(
    role="코드 리뷰어 (Mia + Coco)",
    goal="설계와 코드를 검토하여 버그·보안·성능 이슈를 찾고 수정 패치를 제안한다",
    backstory=f"""
보안 + 무결점 코드 전문가 듀오.
{PROJECT_CONTEXT}
TypeScript 타입 안전성, Firebase 보안 규칙, 에러 핸들링 누락,
불필요한 Firestore 읽기/쓰기, XSS/인증 우회 취약점을 집중 검토한다.
""",
    llm=sonnet,
    verbose=True,
)

designer = Agent(
    role="UI/UX 디자이너 (Holly)",
    goal="사용자 경험을 극대화하는 화면 구조, 컴포넌트, 스타일 가이드를 설계한다",
    backstory=f"""
글래스모피즘 전문 UI/UX 디자인 박사. Tailwind CSS v4 전문가.
{PROJECT_CONTEXT}
반응형(모바일 우선), 접근성, 직관적 흐름, 로딩/에러/빈 상태 UI를 빠짐없이 설계한다.
""",
    llm=sonnet,
    verbose=True,
)

# ── 크루 실행 ────────────────────────────────────────────────────────────────

def run_crew(feature_request: str) -> str:
    task_design = Task(
        description=f"""
다음 기능 요청을 분석하고 완전한 구현 계획을 작성하라:

[요청]
{feature_request}

[출력 형식]
1. 요구사항 분석
2. 아키텍처 설계 (컴포넌트 구조 + 데이터 흐름)
3. 변경/생성할 파일 목록
4. 핵심 코드 초안 (TypeScript/React — 100% 완성본, 생략 금지)
5. Firestore 스키마 변경사항 (필요 시)
6. 단계별 구현 순서 (터미널 명령어 포함)
7. 테스트 체크리스트
""",
        agent=architect,
        expected_output="완전한 구현 계획서 (설계 요약 + 파일 목록 + 전체 코드 초안 + 테스트 목록)",
    )

    task_review = Task(
        description="""
아키텍트의 구현 계획을 아래 항목으로 검토하라.

[검토 항목]
- TypeScript 타입 오류 가능성
- Firebase 보안 규칙 위반 여부
- 에러 핸들링 누락 지점
- Firestore 불필요한 읽기/쓰기
- XSS / 인증 우회 등 보안 취약점
- 중복 코드 / 잔여 코드

[출력 형식]
1. 발견된 문제점 (심각도: 높음 / 중간 / 낮음)
2. 수정 패치 코드 (100% 완성본)
3. 재검증 체크리스트
4. 위험도 재평가 요약
""",
        agent=reviewer,
        expected_output="리뷰 보고서 (문제점 목록 + 수정 패치 + 재검증 체크리스트)",
        context=[task_design],
    )

    task_ui = Task(
        description="""
구현 기능의 UI/UX 설계안을 작성하라.

[설계 항목]
- 화면 흐름 및 사용자 시나리오 (단계별 텍스트 흐름도)
- 컴포넌트 트리 구조
- Tailwind CSS v4 클래스 예시 (글래스모피즘 포함)
- 반응형 레이아웃 (모바일 → 태블릿 → 데스크탑)
- 로딩 / 에러 / 빈 상태 UI 처리 방안
- 접근성 (aria, 키보드 내비게이션) 체크리스트

[출력 형식]
1. 화면 흐름도
2. 컴포넌트 트리
3. 핵심 Tailwind 클래스 예시 코드
4. 접근성 및 반응형 체크리스트
""",
        agent=designer,
        expected_output="UI/UX 설계서 (화면 흐름 + 컴포넌트 구조 + 스타일 가이드)",
        context=[task_design],
    )

    crew = Crew(
        agents=[architect, reviewer, designer],
        tasks=[task_design, task_review, task_ui],
        process=Process.sequential,
        verbose=True,
    )

    result = crew.kickoff()
    return str(result)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n사용법: python crew.py '구현할 기능을 여기에 설명하세요'\n")
        print("예시:")
        print("  python crew.py '배송 현황 실시간 추적 화면 구현'")
        print("  python crew.py '관리자 대시보드에 월별 통계 차트 추가'")
        sys.exit(1)

    feature = " ".join(sys.argv[1:])
    separator = "=" * 60

    print(f"\n{separator}")
    print(f"  wellshare-logis-web 멀티에이전트 크루 시작")
    print(f"{separator}")
    print(f"  요청 기능: {feature}")
    print(f"{separator}\n")

    result = run_crew(feature)

    print(f"\n{separator}")
    print("  최종 통합 결과")
    print(f"{separator}")
    print(result)
