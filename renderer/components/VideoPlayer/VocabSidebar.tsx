import React, {useCallback, useEffect, useState, useRef} from 'react';
import {getColorGradient, getRelativeTime} from '../../utils/utils';
import {ArrowRight, ArrowUp, ArrowDown} from "./Icons"; // Assuming you have these icons
import {videoConstants} from "../../utils/constants";

const VocabSidebar = ({
                        showVocabSidebar,
                        setShowVocabSidebar,
                        lang,
                        setMeaning,
                        tokenizeMiteiru
                      }) => {
  const [sortedVocab, setSortedVocab] = useState([]);
  const [hoveredWord, setHoveredWord] = useState(null);
  const [tokenizedWord, setTokenizedWord] = useState(null);
  const containerRef = useRef(null);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({top: 0, behavior: 'smooth'});
  }, []);

  const scrollToBottom = useCallback(() => {
    containerRef.current?.scrollTo({top: containerRef.current.scrollHeight, behavior: 'smooth'});
  }, []);

  const loadVocabulary = useCallback(async () => {
    try {
      if (!lang) return;
      const loadedState = await window.ipc.invoke('loadLearningState', lang);
      const sorted = Object.entries(loadedState).sort((a: any[], b: any[]) => {
        return a[1].updTime - b[1].updTime;
      });
      setSortedVocab(sorted);
    } catch (error) {
      console.error('Error loading vocabulary:', error);
    }
  }, [lang]);

  useEffect(() => {
    loadVocabulary();
  }, [lang, loadVocabulary]);

  const findClosestWord = useCallback(() => {
    const now = Date.now();
    return sortedVocab.reduce((closest, current) => {
      const closestDiff = Math.abs(closest[1].updTime - now);
      const currentDiff = Math.abs(current[1].updTime - now);
      return currentDiff < closestDiff ? current : closest;
    });
  }, [sortedVocab]);

  useEffect(() => {
    if (showVocabSidebar && containerRef.current && sortedVocab.length > 0) {
      const closestWord = findClosestWord();
      const wordElement = document.getElementById(`word-${closestWord[0]}`);
      if (wordElement) {
        wordElement.scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    }
  }, [showVocabSidebar, sortedVocab, findClosestWord]);

  const jumpToWord = useCallback((word) => {
    setMeaning(word);
  }, [setMeaning]);

  const handleMouseEnter = useCallback(async (word) => {
    setHoveredWord(word);
    const tokenized = await tokenizeMiteiru(word);
    setTokenizedWord(tokenized);
  }, [tokenizeMiteiru]);

  const handleMouseLeave = useCallback(() => {
    setHoveredWord(null);
    setTokenizedWord(null);
  }, []);

  const renderTokenizedWord = useCallback(() => {
    if (!tokenizedWord) return null;

    if (lang === videoConstants.japaneseLang) {
      return tokenizedWord;
    } else if (lang === videoConstants.chineseLang || lang === videoConstants.cantoneseLang) {
      return tokenizedWord.map(t => t.pinyin || t.jyutping);
    }

    return null;
  }, [tokenizedWord, lang]);

  return (
      <div
          ref={containerRef}
          style={{
            transition: "all 0.3s ease-out",
            transform: `translate(${showVocabSidebar ? "0" : "-30vw"}, 0`
          }}
          className={"overflow-y-scroll overflow-x-clip flex flex-col content-center items-center p-3 z-[19] fixed left-0 top-0 h-screen w-[30vw] bg-gray-700/70 text-white"}
      >
        <div className="sticky top-0 z-10 w-full flex justify-center items-center bg-gray-800 p-2">
          <button className="p-2 bg-blue-500 rounded" onClick={scrollToTop}>
            <div className="h-5">
              {ArrowUp}
            </div>
          </button>
        </div>
        <button className={"self-end p-2"} onClick={() => setShowVocabSidebar(old => !old)}>
          <div className={"animation h-5"}>
            {ArrowRight}
          </div>
        </button>
        <div className={"font-bold unselectable text-3xl m-4"}>
          Vocabulary List ({lang})
        </div>

        <div className={"w-full mx-5 px-3 flex flex-col content-start gap-3 unselectable"}>
          {sortedVocab.map((word) => (
              <div
                  key={word[0]}
                  id={`word-${word[0]}`}
                  className="cursor-pointer hover:bg-blue-200 p-2 rounded mb-2 flex flex-col justify-between items-start text-black"
                  onClick={() => jumpToWord(word[0])}
                  onMouseEnter={() => handleMouseEnter(word[0])}
                  onMouseLeave={handleMouseLeave}
                  style={{backgroundColor: getColorGradient(word[1].updTime)}}
              >
                <div className="flex w-full justify-between items-center">
                  <span className="text-3xl">{word[0]}</span>
                  <span className="text-gray-600">{getRelativeTime(word[1].updTime)}</span>
                </div>
                {hoveredWord === word[0] && renderTokenizedWord()}
              </div>
          ))}
        </div>
        <div className="sticky bottom-0 z-10 w-full flex justify-center bg-gray-800 p-2">
          <button className="p-2 bg-blue-500 rounded" onClick={scrollToBottom}>
            <div className="h-5">
              {ArrowDown}
            </div>
          </button>
        </div>
      </div>
  );
};

export default VocabSidebar;